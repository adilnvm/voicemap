package com.voicemap.backend.controller;

import com.voicemap.backend.model.Pincode;
import com.voicemap.backend.service.PincodeService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import org.springframework.data.mongodb.core.geo.GeoJsonPoint;

import java.io.InputStream;
import java.util.*;

@RestController
@RequestMapping("/api/pincode")
@CrossOrigin("*")
public class PincodeController {

    private final PincodeService service;
    private final ObjectMapper mapper = new ObjectMapper();

    public PincodeController(PincodeService service) {
        this.service = service;
    }

    // Exact lookup: GET /api/pincode/110001
    @GetMapping("/{code}")
    public ResponseEntity<?> getByCode(@PathVariable String code) {
        return service.findByCode(code)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    // Prefix search: GET /api/pincode/search?q=4000&limit=8
    @GetMapping("/search")
    public ResponseEntity<List<Pincode>> search(@RequestParam("q") String q,
                                                @RequestParam(value = "limit", required = false, defaultValue = "8") int limit) {
        String cleaned = q.trim();
        List<Pincode> res = service.searchPrefix(cleaned, limit);
        return ResponseEntity.ok(res);
    }

    @GetMapping("/prefix/{prefix}")
    public ResponseEntity<List<Pincode>> prefix(@PathVariable String prefix, @RequestParam(value="limit", required=false, defaultValue="8") int limit) {
        return ResponseEntity.ok(service.searchPrefix(prefix, limit));
    }


    // Optional: import endpoint to upload the GeoJSON file (multipart).
    // Accepts the format you described. Field 'file'.
    @PostMapping("/import")
    public ResponseEntity<String> importGeoJson(@RequestParam("file") MultipartFile file) {
        try (InputStream in = file.getInputStream()) {
            JsonNode root = mapper.readTree(in);
            if (!root.has("features") || !root.get("features").isArray()) {
                return ResponseEntity.badRequest().body("Invalid GeoJSON");
            }
            int count = 0;
            for (JsonNode f : root.get("features")) {
                JsonNode geom = f.get("geometry");
                JsonNode props = f.get("properties");
                if (geom == null || !geom.has("coordinates")) continue;
                JsonNode coords = geom.get("coordinates");
                double lon = coords.get(0).asDouble();
                double lat = coords.get(1).asDouble();
                Pincode p = new Pincode();
                String code = null;
                if (props != null && props.has("Pincode")) code = props.get("Pincode").asText();
                else if (props != null && props.has("PINCODE")) code = props.get("PINCODE").asText();
                if (code == null) continue;
                p.setPincode(code);
                if (props != null && props.has("Office_Name")) p.setOfficeName(props.get("Office_Name").asText());
                if (props != null && props.has("Division")) p.setDivision(props.get("Division").asText());
                if (props != null && props.has("Region")) p.setRegion(props.get("Region").asText());
                if (props != null && props.has("Circle")) p.setCircle(props.get("Circle").asText());
                p.setLocation(new GeoJsonPoint(lon, lat));
                service.save(p);
                count++;
            }
            return ResponseEntity.ok("Imported pincodes: " + count);
        } catch (Exception ex) {
            ex.printStackTrace();
            return ResponseEntity.status(500).body("Import failed: " + ex.getMessage());
        }
    }

    // Optional convenience: auto-import at start from resources (triggered manually elsewhere).
    @GetMapping("/import/from-resource")
    public ResponseEntity<String> importFromResource() {
        try {
            ClassPathResource r = new ClassPathResource("data/pincode.points.geojson");
            if (!r.exists()) return ResponseEntity.badRequest().body("Resource not found");
            try (InputStream in = r.getInputStream()) {
                // reuse import logic: call above method functionality
                JsonNode root = mapper.readTree(in);
                if (!root.has("features") || !root.get("features").isArray()) {
                    return ResponseEntity.badRequest().body("Invalid GeoJSON");
                }
                int count = 0;
                for (JsonNode f : root.get("features")) {
                    JsonNode geom = f.get("geometry");
                    JsonNode props = f.get("properties");
                    if (geom == null || !geom.has("coordinates")) continue;
                    JsonNode coords = geom.get("coordinates");
                    double lon = coords.get(0).asDouble();
                    double lat = coords.get(1).asDouble();
                    Pincode p = new Pincode();
                    String code = null;
                    if (props != null && props.has("Pincode")) code = props.get("Pincode").asText();
                    else if (props != null && props.has("PINCODE")) code = props.get("PINCODE").asText();
                    if (code == null) continue;
                    p.setPincode(code);
                    if (props != null && props.has("Office_Name")) p.setOfficeName(props.get("Office_Name").asText());
                    if (props != null && props.has("Division")) p.setDivision(props.get("Division").asText());
                    if (props != null && props.has("Region")) p.setRegion(props.get("Region").asText());
                    if (props != null && props.has("Circle")) p.setCircle(props.get("Circle").asText());
                    p.setLocation(new GeoJsonPoint(lon, lat));
                    service.save(p);
                    count++;
                }
                return ResponseEntity.ok("Imported pincodes: " + count);
            }
        } catch (Exception ex) {
            ex.printStackTrace();
            return ResponseEntity.status(500).body("Import failed: " + ex.getMessage());
        }
    }
}