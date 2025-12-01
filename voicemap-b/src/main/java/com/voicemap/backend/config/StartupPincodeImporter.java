package com.voicemap.backend.config;

import com.voicemap.backend.model.Pincode;
import com.voicemap.backend.service.PincodeService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.mongodb.core.geo.GeoJsonPoint;
import org.springframework.stereotype.Component;

import java.io.InputStream;

@Component
public class StartupPincodeImporter implements CommandLineRunner {

    private final PincodeService service;
    private final ObjectMapper mapper = new ObjectMapper();

    public StartupPincodeImporter(PincodeService service) {
        this.service = service;
    }

    @Override
    public void run(String... args) throws Exception {
        if (service.count() > 0) {
            System.out.println("Pincode collection not empty; skipping startup import.");
            return;
        }

        ClassPathResource r = new ClassPathResource("data/pincode.points.geojson");
        if (!r.exists()) {
            System.out.println("No pincode.points.geojson in resources; skipping import.");
            return;
        }
        try (InputStream in = r.getInputStream()) {
            JsonNode root = mapper.readTree(in);
            if (!root.has("features") || !root.get("features").isArray()) {
                System.out.println("Invalid GeoJSON; skipping.");
                return;
            }
            int count = 0;
            for (JsonNode f : root.get("features")) {
                try {
                    JsonNode geom = f.get("geometry");
                    JsonNode props = f.get("properties");
                    if (geom == null || !geom.has("coordinates")) continue;
                    double lon = geom.get("coordinates").get(0).asDouble();
                    double lat = geom.get("coordinates").get(1).asDouble();
                    String code = null;
                    if (props != null && props.has("Pincode")) code = props.get("Pincode").asText();
                    if (code == null && props != null && props.has("PINCODE")) code = props.get("PINCODE").asText();
                    if (code == null) continue;
                    Pincode p = new Pincode();
                    p.setPincode(code);
                    if (props != null && props.has("Office_Name")) p.setOfficeName(props.get("Office_Name").asText());
                    if (props != null && props.has("Division")) p.setDivision(props.get("Division").asText());
                    if (props != null && props.has("Region")) p.setRegion(props.get("Region").asText());
                    if (props != null && props.has("Circle")) p.setCircle(props.get("Circle").asText());
                    p.setLocation(new GeoJsonPoint(lon, lat));
                    service.save(p);
                    count++;
                } catch (Exception ex) {
                    // per-feature failure — continue
                }
            }
            System.out.println("Startup pincodes imported: " + count);
        }
    }
}