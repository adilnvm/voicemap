package com.voicemap.backend.controller;

import org.locationtech.jts.geom.*;
import org.locationtech.jts.simplify.DouglasPeuckerSimplifier;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Basic utility to simplify GeoJSON-like geometry represented as nested Maps/Lists.
 * Supports Polygon and MultiPolygon.
 */
public class GeometrySimplifier {

    private static final GeometryFactory GF = new GeometryFactory(new PrecisionModel(), 4326);

    /**
     * Expect geometry object as Map { "type": "MultiPolygon"|"Polygon", "coordinates": ... }
     * Returns simplified raw geometry map.
     */
    @SuppressWarnings("unchecked")
    public static Object simplifyGeometryRaw(Object geometryObj, double tolerance) {
        if (geometryObj == null) return null;
        if (!(geometryObj instanceof Map)) return geometryObj;
        Map<String, Object> geom = (Map<String, Object>) geometryObj;
        String type = (String) geom.get("type");
        if ("Polygon".equalsIgnoreCase(type)) {
            List<List<List<Double>>> coords = (List<List<List<Double>>>) geom.get("coordinates");
            Polygon poly = polygonFromCoords(coords);
            Geometry simp = DouglasPeuckerSimplifier.simplify(poly, tolerance);
            return geometryToGeoJsonMap(simp);
        } else if ("MultiPolygon".equalsIgnoreCase(type)) {
            List<Object> polysRaw = (List<Object>) geom.get("coordinates");
            List<Polygon> jtsPolys = new ArrayList<>();
            for (Object polyRaw : polysRaw) {
                // polyRaw is List<List<List<Double>>>
                Polygon p = polygonFromCoords((List<List<List<Double>>>) polyRaw);
                jtsPolys.add(p);
            }
            GeometryCollection gc = GF.createGeometryCollection(jtsPolys.toArray(new Polygon[0]));
            Geometry simp = DouglasPeuckerSimplifier.simplify(gc, tolerance);
            return geometryToGeoJsonMap(simp);
        } else {
            // unsupported -> return as-is
            return geometryObj;
        }
    }

    // Helper to build a JTS Polygon from nested lists (rings)
    private static Polygon polygonFromCoords(List<List<List<Double>>> rings) {
        if (rings == null || rings.isEmpty()) return GF.createPolygon();
        // first ring is outer ring
        Coordinate[] outer = ringToCoords(rings.get(0));
        LinearRing shell = GF.createLinearRing(outer);

        LinearRing[] holes = null;
        if (rings.size() > 1) {
            holes = new LinearRing[rings.size() - 1];
            for (int i = 1; i < rings.size(); i++) {
                holes[i - 1] = GF.createLinearRing(ringToCoords(rings.get(i)));
            }
        }
        return GF.createPolygon(shell, holes);
    }

    private static Coordinate[] ringToCoords(List<List<Double>> ring) {
        List<Coordinate> coords = ring.stream().map(pt -> new Coordinate(pt.get(0), pt.get(1))).collect(Collectors.toList());
        // ensure closed
        if (!coords.get(0).equals2D(coords.get(coords.size() - 1))) {
            coords.add(coords.get(0));
        }
        return coords.toArray(new Coordinate[0]);
    }

    // Convert a JTS Geometry back to GeoJSON-like map
    private static Map<String, Object> geometryToGeoJsonMap(Geometry g) {
        Map<String, Object> m = new HashMap<>();
        if (g instanceof Polygon) {
            m.put("type", "Polygon");
            m.put("coordinates", polygonToCoords((Polygon) g));
        } else if (g instanceof MultiPolygon) {
            m.put("type", "MultiPolygon");
            MultiPolygon mp = (MultiPolygon) g;
            List<Object> polys = new ArrayList<>();
            for (int i = 0; i < mp.getNumGeometries(); i++) {
                polys.add(polygonToCoords((Polygon) mp.getGeometryN(i)));
            }
            m.put("coordinates", polys);
        } else if (g instanceof GeometryCollection) {
            // flatten polygons into multipolygon
            List<Object> polys = new ArrayList<>();
            for (int i = 0; i < g.getNumGeometries(); i++) {
                Geometry gi = g.getGeometryN(i);
                if (gi instanceof Polygon) {
                    polys.add(polygonToCoords((Polygon) gi));
                } else if (gi instanceof MultiPolygon) {
                    MultiPolygon mp2 = (MultiPolygon) gi;
                    for (int j = 0; j < mp2.getNumGeometries(); j++) {
                        polys.add(polygonToCoords((Polygon) mp2.getGeometryN(j)));
                    }
                }
            }
            m.put("type", "MultiPolygon");
            m.put("coordinates", polys);
        } else {
            // fallback: bounding box to polygon
            m.put("type", "Polygon");
            m.put("coordinates", Arrays.asList(Arrays.asList(Arrays.asList(0,0), Arrays.asList(0,0))));
        }
        return m;
    }

    private static List<List<List<Double>>> polygonToCoords(Polygon p) {
        List<List<List<Double>>> rings = new ArrayList<>();
        rings.add(linearRingToList(p.getExteriorRing()));
        for (int i = 0; i < p.getNumInteriorRing(); i++) {
            rings.add(linearRingToList(p.getInteriorRingN(i)));
        }
        return rings;
    }

    private static List<List<Double>> linearRingToList(LineString ring) {
        List<List<Double>> coords = new ArrayList<>();
        for (int i = 0; i < ring.getNumPoints(); i++) {
            Coordinate c = ring.getCoordinateN(i);
            coords.add(Arrays.asList(c.x, c.y));
        }
        return coords;
    }
}