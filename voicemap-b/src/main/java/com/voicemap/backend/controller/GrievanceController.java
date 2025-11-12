package com.voicemap.backend.controller;

import com.voicemap.backend.dto.GrievanceRequest;
import com.voicemap.backend.dto.GrievanceResponse;
import com.voicemap.backend.model.Grievance;
import com.voicemap.backend.service.GrievanceService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.geo.GeoJsonPoint;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/grievances")
@Validated
public class GrievanceController {

    private final GrievanceService service;

    public GrievanceController(GrievanceService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<GrievanceResponse> create(@Valid @RequestBody GrievanceRequest req) {
        Grievance g = new Grievance();
        g.setTitle(req.getTitle());
        g.setDescription(req.getDescription());
        g.setCategory(req.getCategory());
        g.setState(req.getState());
        g.setDistrict(req.getDistrict());
        g.setLocation(new GeoJsonPoint(req.getLongitude(), req.getLatitude()));

        Grievance saved = service.createGrievance(g);

        GrievanceResponse r = new GrievanceResponse();
        r.setId(saved.getId());
        r.setTitle(saved.getTitle());
        r.setDescription(saved.getDescription());
        r.setCategory(saved.getCategory());
        r.setState(saved.getState());
        r.setDistrict(saved.getDistrict());
        r.setStatus(saved.getStatus());
        r.setCreatedAt(saved.getCreatedAt());
        if (saved.getLocation() != null) {
            r.setLatitude(saved.getLocation().getY());
            r.setLongitude(saved.getLocation().getX());
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(r);
    }

    @GetMapping
    public ResponseEntity<Page<GrievanceResponse>> list(
            @RequestParam(value = "district", required = false) String district,
            @RequestParam(value = "category", required = false) String category,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "size", defaultValue = "20") int size,
            @RequestParam(value = "sort", defaultValue = "createdAt,desc") String sort
    ) {
        String[] parts = sort.split(",");
        String field = parts[0];
        Sort.Direction dir = (parts.length > 1 && parts[1].equalsIgnoreCase("asc"))
                ? Sort.Direction.ASC : Sort.Direction.DESC;
        Pageable pageable = PageRequest.of(page, size, Sort.by(dir, field));

        Page<Grievance> data = service.find(district, category, pageable);
        Page<GrievanceResponse> mapped = data.map(g -> {
            GrievanceResponse r = new GrievanceResponse();
            r.setId(g.getId());
            r.setTitle(g.getTitle());
            r.setDescription(g.getDescription());
            r.setCategory(g.getCategory());
            r.setState(g.getState());
            r.setDistrict(g.getDistrict());
            r.setStatus(g.getStatus());
            r.setCreatedAt(g.getCreatedAt());
            if (g.getLocation() != null) {
                r.setLatitude(g.getLocation().getY());
                r.setLongitude(g.getLocation().getX());
            }
            return r;
        });
        return ResponseEntity.ok(mapped);
    }

    @GetMapping("/{id}")
    public ResponseEntity<GrievanceResponse> getById(@PathVariable String id) {
        return service.getGrievanceById(id)
                .map(g -> {
                    GrievanceResponse r = new GrievanceResponse();
                    r.setId(g.getId());
                    r.setTitle(g.getTitle());
                    r.setDescription(g.getDescription());
                    r.setCategory(g.getCategory());
                    r.setState(g.getState());
                    r.setDistrict(g.getDistrict());
                    r.setStatus(g.getStatus());
                    r.setCreatedAt(g.getCreatedAt());
                    if (g.getLocation() != null) {
                        r.setLatitude(g.getLocation().getY());
                        r.setLongitude(g.getLocation().getX());
                    }
                    return ResponseEntity.ok(r);
                })
                .orElse(ResponseEntity.notFound().build());
    }
}
