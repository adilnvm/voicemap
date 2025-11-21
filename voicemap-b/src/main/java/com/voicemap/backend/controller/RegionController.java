package com.voicemap.backend.controller;

import com.voicemap.backend.model.Region;
import com.voicemap.backend.service.RegionImporter;
import com.voicemap.backend.service.RegionService;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.util.List;

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