package com.voicemap.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.locationtech.jts.geom.*;
import org.locationtech.jts.simplify.DouglasPeuckerSimplifier;
import org.locationtech.jts.operation.valid.IsValidOp;
import org.springframework.data.geo.Point;
import org.springframework.data.mongodb.core.geo.GeoJsonMultiPolygon;
import org.springframework.data.mongodb.core.geo.GeoJsonPolygon;

import java.util.ArrayList;
import java.util.List;

    /**
     * GeoJsonConverter: reads GeoJSON geometry nodes (Polygon / MultiPolygon),
     * sanitizes them using JTS (fix duplicate points, fix invalid polygons,
     * optional simplification), and converts to Spring Data GeoJson objects.
     *
     * Uses moderate simplification tolerance (chosen strategy B).
     *
     // -------------------------------------------------------------
     // Convert GeoJSON geometry → GeoJsonMultiPolygon
     // -------------------------------------------------------------
     */
    public class GeoJsonConverter {

        private static final GeometryFactory GEOM_FACTORY = new GeometryFactory(new PrecisionModel(), 4326);
        // tolerance in degrees (approx). 0.00005 ≈ 5.5m near equator — moderate simplification.
        private static final double SIMPLIFY_TOLERANCE = 0.00005;

        /**
         * Convert GeoJSON geometry node → GeoJsonMultiPolygon, sanitizing and simplifying.
         */
        public static GeoJsonMultiPolygon toMultiPolygon(JsonNode geom) throws IllegalArgumentException {
            String type = geom.get("type").asText();

            try {
                if ("MultiPolygon".equalsIgnoreCase(type)) {
                    List<GeoJsonPolygon> polygons = new ArrayList<>();
                    for (JsonNode polyCoords : geom.get("coordinates")) {
                        // polyCoords is an array of rings (exterior + holes)
                        Geometry jts = buildAndCleanPolygonFromCoordsArray(polyCoords);
                        if (jts == null || jts.isEmpty()) continue;
                        // Convert each polygon (possibly a MultiPolygon -> multiple polygons)
                        if (jts instanceof Polygon) {
                            GeoJsonPolygon gp = polygonToGeoJsonPolygon((Polygon) jts);
                            if (gp != null) polygons.add(gp);
                        } else if (jts instanceof MultiPolygon) {
                            for (int i = 0; i < jts.getNumGeometries(); i++) {
                                Polygon p = (Polygon) jts.getGeometryN(i);
                                GeoJsonPolygon gp = polygonToGeoJsonPolygon(p);
                                if (gp != null) polygons.add(gp);
                            }
                        }
                    }
                    if (polygons.isEmpty()) throw new IllegalArgumentException("No valid polygons found in MultiPolygon");
                    return new GeoJsonMultiPolygon(polygons);
                } else if ("Polygon".equalsIgnoreCase(type)) {
                    Geometry jts = buildAndCleanPolygonFromCoordsArray(geom.get("coordinates"));
                    if (jts == null || jts.isEmpty()) throw new IllegalArgumentException("Invalid Polygon geometry");
                    List<GeoJsonPolygon> polygons = new ArrayList<>();
                    if (jts instanceof Polygon) {
                        GeoJsonPolygon gp = polygonToGeoJsonPolygon((Polygon) jts);
                        if (gp != null) polygons.add(gp);
                    } else if (jts instanceof MultiPolygon) {
                        for (int i = 0; i < jts.getNumGeometries(); i++) {
                            Polygon p = (Polygon) jts.getGeometryN(i);
                            GeoJsonPolygon gp = polygonToGeoJsonPolygon(p);
                            if (gp != null) polygons.add(gp);
                        }
                    }
                    return new GeoJsonMultiPolygon(polygons);
                } else {
                    throw new IllegalArgumentException("Unsupported geometry type: " + type);
                }
            } catch (Exception ex) {
                throw new IllegalArgumentException("Failed to convert geometry: " + ex.getMessage(), ex);
            }
        }

        // Build a JTS Geometry (Polygon/MultiPolygon) from the GeoJSON rings array and sanitize it.
        private static Geometry buildAndCleanPolygonFromCoordsArray(JsonNode polyCoords) {
            // polyCoords: [ [ [lon,lat], ... ] (exterior) , [hole1], [hole2], ... ]
            try {
                // Build exterior ring
                LinearRing shell = coordsNodeToLinearRing(polyCoords.get(0));
                if (shell == null || shell.isEmpty()) return null;

                // Build holes if present
                List<LinearRing> holes = new ArrayList<>();
                for (int i = 1; i < polyCoords.size(); i++) {
                    LinearRing hole = coordsNodeToLinearRing(polyCoords.get(i));
                    if (hole != null && !hole.isEmpty() && hole.getNumPoints() >= 4) {
                        holes.add(hole);
                    }
                }

                LinearRing[] holeArray = holes.isEmpty() ? null : holes.toArray(new LinearRing[0]);
                Polygon polygon = GEOM_FACTORY.createPolygon(shell, holeArray);

                // If geometry invalid, attempt to fix with buffer(0)
                if (!isValidPolygon(polygon)) {
                    Geometry fixed = polygon.buffer(0);
                    if (fixed == null || fixed.isEmpty()) {
                        // try to extract polygons if buffer produced MultiPolygon
                        if (fixed != null && fixed instanceof MultiPolygon) {
                            // we'll return the fixed multi
                            polygon = null;
                            // simplify below
                            Geometry simplified = simplifyGeometry(fixed);
                            return simplified;
                        }
                        return null;
                    } else {
                        polygon = (fixed instanceof Polygon) ? (Polygon) fixed : null;
                        if (polygon == null) {
                            // if buffer returned MultiPolygon or other, just simplify and return
                            Geometry simplified = simplifyGeometry(fixed);
                            return simplified;
                        }
                    }
                }

                // Simplify moderately
                Geometry simplified = simplifyGeometry(polygon);
                // Ensure final validity
                if (!isValidPolygon(simplified)) {
                    Geometry fixed2 = simplified.buffer(0);
                    return (fixed2 == null) ? simplified : fixed2;
                }
                return simplified;
            } catch (Exception ex) {
                // swallow individual polygon errors (we'll skip invalid ones)
                return null;
            }
        }

        // Convert a Polygon into a GeoJsonPolygon (exterior only). Holes are not supported by GeoJsonPolygon constructors in all Spring versions,
        // so we keep exterior ring which is sufficient for most region containment queries and accepted by Mongo.
        private static GeoJsonPolygon polygonToGeoJsonPolygon(Polygon p) {
            if (p == null || p.isEmpty()) return null;
            Coordinate[] coords = p.getExteriorRing().getCoordinates();
            if (coords == null || coords.length < 4) return null;

            List<Point> pts = new ArrayList<>();
            for (Coordinate c : coords) {
                pts.add(new Point(c.x, c.y)); // Note: Point expects (x=lon, y=lat)
            }
            return new GeoJsonPolygon(pts);
        }

        private static LinearRing coordsNodeToLinearRing(JsonNode ringNode) {
            if (ringNode == null || !ringNode.isArray() || ringNode.size() == 0) return null;
            List<Coordinate> coords = new ArrayList<>();
            Coordinate last = null;
            for (JsonNode coord : ringNode) {
                double lon = coord.get(0).asDouble();
                double lat = coord.get(1).asDouble();
                Coordinate current = new Coordinate(lon, lat);
                // skip duplicate consecutive
                if (last != null && current.equals2D(last)) {
                    last = current;
                    continue;
                }
                coords.add(current);
                last = current;
            }
            // Ensure ring is closed
            if (coords.size() > 0) {
                Coordinate first = coords.get(0);
                Coordinate lastCoord = coords.get(coords.size() - 1);
                if (!first.equals2D(lastCoord)) {
                    coords.add(new Coordinate(first.x, first.y));
                }
            }

            // if ring too small, ignore
            if (coords.size() < 4) return null;

            Coordinate[] arr = coords.toArray(new Coordinate[0]);
            return GEOM_FACTORY.createLinearRing(arr);
        }

        // moderate simplification using Douglas-Peucker
        private static Geometry simplifyGeometry(Geometry g) {
            if (g == null) return null;
            // If geometry is tiny, skip simplify
            double tol = SIMPLIFY_TOLERANCE;
            try {
                Geometry simplified = DouglasPeuckerSimplifier.simplify(g, tol);
                if (simplified == null || simplified.isEmpty()) return g;
                return simplified;
            } catch (Exception ex) {
                return g;
            }
        }

        private static boolean isValidPolygon(Geometry g) {
            if (g == null || g.isEmpty()) return false;
            IsValidOp op = new IsValidOp(g);
            return op.isValid();
        }

        // ---- bbox and centroid functions (unchanged behaviour) ----

        public static double[] calcBBox(JsonNode geom) {
            final double[] minLon = {Double.POSITIVE_INFINITY};
            final double[] minLat = {Double.POSITIVE_INFINITY};
            final double[] maxLon = {Double.NEGATIVE_INFINITY};
            final double[] maxLat = {Double.NEGATIVE_INFINITY};

            String type = geom.get("type").asText();

            if ("Polygon".equalsIgnoreCase(type)) {
                iterateCoords(geom.get("coordinates"), (lon, lat) -> {
                    if (lon < minLon[0]) minLon[0] = lon;
                    if (lon > maxLon[0]) maxLon[0] = lon;
                    if (lat < minLat[0]) minLat[0] = lat;
                    if (lat > maxLat[0]) maxLat[0] = lat;
                });

            } else if ("MultiPolygon".equalsIgnoreCase(type)) {
                for (JsonNode polyCoords : geom.get("coordinates")) {
                    iterateCoords(polyCoords, (lon, lat) -> {
                        if (lon < minLon[0]) minLon[0] = lon;
                        if (lon > maxLon[0]) maxLon[0] = lon;
                        if (lat < minLat[0]) minLat[0] = lat;
                        if (lat > maxLat[0]) maxLat[0] = lat;
                    });
                }
            }

            if (minLon[0] == Double.POSITIVE_INFINITY) return null;

            return new double[]{minLon[0], minLat[0], maxLon[0], maxLat[0]};
        }

        public static double[] calcCentroid(JsonNode geom) {
            double sumLon = 0;
            double sumLat = 0;
            int count = 0;

            String type = geom.get("type").asText();

            if ("Polygon".equalsIgnoreCase(type)) {
                JsonNode exterior = geom.get("coordinates").get(0);
                for (JsonNode coord : exterior) {
                    sumLon += coord.get(0).asDouble();
                    sumLat += coord.get(1).asDouble();
                    count++;
                }
            } else if ("MultiPolygon".equalsIgnoreCase(type)) {
                for (JsonNode polyCoords : geom.get("coordinates")) {
                    JsonNode exterior = polyCoords.get(0);
                    for (JsonNode coord : exterior) {
                        sumLon += coord.get(0).asDouble();
                        sumLat += coord.get(1).asDouble();
                        count++;
                    }
                }
            }

            if (count == 0) return null;

            return new double[]{sumLon / count, sumLat / count};
        }

        private interface CoordConsumer {
            void accept(double lon, double lat);
        }

        private static void iterateCoords(JsonNode rings, CoordConsumer consumer) {
            for (JsonNode ring : rings) {
                for (JsonNode coord : ring) {
                    consumer.accept(coord.get(0).asDouble(), coord.get(1).asDouble());
                }
            }
        }
    }
