package com.voicemap.backend.controller;

import com.voicemap.backend.model.Region;
import com.voicemap.backend.service.RegionImporter;
import com.voicemap.backend.service.RegionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/regions")
@CrossOrigin("*")
@RequiredArgsConstructor
public class RegionController {

    private final RegionService regionService;

    @GetMapping("/all")
    public List<Region> getAll() {
        return regionService.getAllRegions();
    }

    @GetMapping("/{id}")
    public ResponseEntity<Region> getById(@PathVariable String id) {
        return regionService.findById(id).map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/search")
    public ResponseEntity<List<Region>> search(@RequestParam("q") String q) {
        return ResponseEntity.ok(regionService.searchByName(q));
    }

    /**
     * Return GeoJSON FeatureCollection.
     *
     * Two modes:
     * 1) single-region mode: provide type and either name or id
     *    Example: /api/regions/geojson?type=state&name=Maharashtra
     *
     * 2) collection mode: provide type (state|pc|district) and optional simplify
     *    Example: /api/regions/geojson?type=pc&simplify=0.01
     */
    @GetMapping("/geojson")
    public Map<String, Object> getGeoJson(
            @RequestParam String type,
            @RequestParam(value = "simplify", required = false) Double simplifyTolerance,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String id
    ) {
        // If user provided name or id, return a single-region FeatureCollection
        if (name != null || id != null) {
            Region region = null;

            if (name != null) {
                region = regionService.findOneByTypeAndName(type, name)
                        .orElseThrow(() -> new RuntimeException("Region not found: " + name));
            } else if (id != null) {
                region = regionService.findById(id)
                        .orElseThrow(() -> new RuntimeException("Region not found by ID: " + id));
            } else {
                throw new RuntimeException("Provide either 'name' or 'id'");
            }

            Map<String, Object> feature = new HashMap<>();
            feature.put("type", "Feature");

            // PROPERTIES
            Map<String, Object> props = new HashMap<>();
            props.put("id", region.getId());
            props.put("name", region.getName());
            props.put("type", region.getType());
            props.put("state", region.getState());
            props.put("district", region.getDistrict());
            props.put("source", region.getSource());
            feature.put("properties", props);

            // GEOMETRY - try to keep same conversion/simplify behavior as collection mode
            Object geometry = region.getGeo();
            try {
                geometry = GeoJsonConverter.geoToGeoJsonRaw(region.getGeo());
            } catch (Exception ignored) {
                // fallback: keep raw region.getGeo() if conversion not available
                geometry = region.getGeo();
            }
            if (simplifyTolerance != null && simplifyTolerance > 0) {
                try {
                    geometry = GeometrySimplifier.simplifyGeometryRaw(geometry, simplifyTolerance);
                } catch (Exception ignored) {
                    // if simplification fails, return original geometry
                }
            }
            feature.put("geometry", geometry);

            // WRAP IN FeatureCollection
            Map<String, Object> fc = new HashMap<>();
            fc.put("type", "FeatureCollection");
            fc.put("features", List.of(feature));

            return fc;
        }

        // Otherwise, return collection for given type (existing behavior)
        List<Region> regions = regionService.findByType(type);

        List<Map<String, Object>> features = regions.stream().map(r -> {
            Map<String, Object> f = new HashMap<>();
            f.put("type", "Feature");

            // PROPERTIES — choose what you want to expose
            Map<String, Object> props = new HashMap<>();
            props.put("name", r.getName());
            props.put("state", r.getState());
            props.put("code", r.getCode());
            props.put("type", r.getType());
            props.put("id", r.getId());
            f.put("properties", props);

            // GEOMETRY from Mongo: GeoJsonMultiPolygon -> raw GeoJSON structure
            // Optionally simplify before returning
            Object geometry = GeoJsonConverter.geoToGeoJsonRaw(r.getGeo());
            if (simplifyTolerance != null && simplifyTolerance > 0) {
                geometry = GeometrySimplifier.simplifyGeometryRaw(geometry, simplifyTolerance);
            }
            f.put("geometry", geometry);

            return f;
        }).collect(Collectors.toList());

        Map<String, Object> fc = new HashMap<>();
        fc.put("type", "FeatureCollection");
        fc.put("features", features);

        return fc;
    }

    @GetMapping("/contains")
    public ResponseEntity<List<Region>> contains(
            @RequestParam("lat") double lat,
            @RequestParam("lng") double lng,
            @RequestParam(value = "type", required = false) String type
    ) {
        return ResponseEntity.ok(regionService.findContaining(lat, lng, type));
    }

    @PostMapping("/import")
    public ResponseEntity<String> importGeoJson(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "source", required = false) String source,
            @RequestParam(value = "type", required = false) String type
    ) {
        try (InputStream in = file.getInputStream()) {
            RegionImporter importer = new RegionImporter(regionService);
            int count = importer.importFromGeoJson(in, source, type);
            return ResponseEntity.ok("Imported regions: " + count);
        } catch (Exception ex) {
            ex.printStackTrace();
            return ResponseEntity.status(500).body("Import failed: " + ex.getMessage());
        }
    }

}
// end of RegionController file
