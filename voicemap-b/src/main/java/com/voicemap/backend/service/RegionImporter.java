package com.voicemap.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.voicemap.backend.model.Region;
import org.springframework.data.mongodb.core.geo.GeoJsonMultiPolygon;

import java.io.InputStream;
import java.util.Iterator;

public class RegionImporter {

    private final RegionService regionService;
    private final ObjectMapper mapper = new ObjectMapper();

    public RegionImporter(RegionService regionService) {
        this.regionService = regionService;
    }

    /**
     * Import GeoJSON FeatureCollection from InputStream.
     * Each feature should have properties: name, state, type (optional).
     * defaultType is used when properties.type missing.
     */
    public int importFromGeoJson(InputStream in, String source, String defaultType) throws Exception {
        JsonNode root = mapper.readTree(in);
        if (!root.has("features") || !root.get("features").isArray()) {
            throw new IllegalArgumentException("Invalid GeoJSON FeatureCollection");
        }

        int count = 0;
        Iterator<JsonNode> it = root.get("features").elements();
        while (it.hasNext()) {
            JsonNode feature = it.next();
            JsonNode props = feature.get("properties");
            JsonNode geom = feature.get("geometry");
            if (geom == null) continue;

            String name = null;
            if (props != null) {
                if (props.has("name")) name = props.get("name").asText();
                else if (props.has("NAME")) name = props.get("NAME").asText();
                else if (props.has("Name")) name = props.get("Name").asText();
            }

            String state = props != null && props.has("state") ? props.get("state").asText() : null;
            String code = props != null && props.has("code") ? props.get("code").asText() : null;
            String type = props != null && props.has("type") ? props.get("type").asText() : defaultType;

            if (name == null) {
                // try fallback properties
                if (props != null && props.has("DISTRICT")) name = props.get("DISTRICT").asText();
                else name = "unknown";
            }

            Region r = new Region();
            r.setName(name);
            r.setCode(code);
            r.setState(state);
            r.setType(type);
            r.setSource(source);
            if (source != null && source.matches("\\d{4}")) {
                r.setSourceYear(Integer.parseInt(source));
            }

            GeoJsonMultiPolygon multi = GeoJsonConverter.toMultiPolygon(geom);
            r.setGeo(multi);

            double[] bbox = GeoJsonConverter.calcBBox(geom);
            r.setBbox(bbox);

            double[] centroid = GeoJsonConverter.calcCentroid(geom);
            r.setCentroid(centroid);

            regionService.save(r);
            count++;
        }
        return count;
    }
}