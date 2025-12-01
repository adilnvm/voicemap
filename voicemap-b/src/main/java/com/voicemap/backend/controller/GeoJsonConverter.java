package com.voicemap.backend.controller;

import org.springframework.data.mongodb.core.geo.GeoJsonMultiPolygon;
import org.springframework.data.mongodb.core.geo.GeoJsonPolygon;
import org.springframework.data.mongodb.core.geo.GeoJsonPoint;

import java.util.*;

public class GeoJsonConverter {

    /**
     * Convert GeoJsonMultiPolygon to raw GeoJSON-compatible Map structure.
     * If r.getGeo() is stored differently, adapt as needed.
     */
    /**
     * Convert GeoJsonMultiPolygon to raw GeoJSON-compatible Map structure.
     */
    public static Map<String, Object> geoToGeoJsonRaw(GeoJsonMultiPolygon multi) {
        if (multi == null) return null;

        Map<String, Object> g = new HashMap<>();
        g.put("type", "MultiPolygon");

        // The top level is a List of Polygons (which are themselves lists of rings)
        List<List<List<double[]>>> multipoly = new ArrayList<>();

        // 1. Iterate over each GeoJsonPolygon in the MultiPolygon
        multi.getCoordinates().forEach(polygon -> {
            List<List<double[]>> polyRings = new ArrayList<>();

            // 2. Iterate over the GeoJsonLineString rings (boundary/holes) in the Polygon
            polygon.getCoordinates().forEach(ring -> { // <-- Correction 1: Added .getCoordinates()
                List<double[]> ringCoords = new ArrayList<>();

                // 3. Iterate over the GeoJsonPoint objects in the LineString ring
                ring.getCoordinates().forEach(point -> { // <-- Correction 2: Added .getCoordinates()
                    // GeoJSON format is [longitude (X), latitude (Y)]
                    ringCoords.add(new double[]{point.getX(), point.getY()});
                });
                polyRings.add(ringCoords);
            });
            multipoly.add(polyRings);
        });

        g.put("coordinates", multipoly);
        return g;
    }

    /**
     * If your `Region.geo` is stored as a raw Map (Document) already, just return it.
     * Provide an overloaded helper if alternate storage exists.
     */
}