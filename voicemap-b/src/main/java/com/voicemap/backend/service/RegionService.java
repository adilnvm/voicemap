package com.voicemap.backend.service;

import com.voicemap.backend.model.Region;
import com.voicemap.backend.repository.RegionRepository;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.geo.GeoJsonPoint;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;

@Service
public class RegionService {

    private final RegionRepository regionRepository;
    private final MongoTemplate mongoTemplate;

    public RegionService(RegionRepository regionRepository, MongoTemplate mongoTemplate) {
        this.regionRepository = regionRepository;
        this.mongoTemplate = mongoTemplate;
    }

    public Region save(Region r) {
        if (r.getCreatedAt() == null) r.setCreatedAt(java.time.Instant.now());
        return regionRepository.save(r);
    }

    public Optional<Region> findById(String id) {
        return regionRepository.findById(id);
    }

    public List<Region> findByType(String type) {
        return regionRepository.findByType(type);
    }

    public List<Region> findByTypeAndState(String type, String state) {
        return regionRepository.findByTypeAndState(type, state);
    }

    public List<Region> searchByName(String q) {
        String cleaned = q.replaceAll("[^A-Za-z0-9 ]", "");
        String regex = ".*" + cleaned + ".*";
        return regionRepository.findByNameRegexIgnoreCase(regex);
    }

    /**
     * Find regions that contain the given lat/lng. Optionally filter by type.
     * Returns matches sorted by estimated area (smallest first).
     */
    public List<Region> findContaining(double lat, double lon, String preferredType) {
        GeoJsonPoint point = new GeoJsonPoint(lon, lat);

        Criteria criteria = Criteria.where("geo").intersects(point);
        if (preferredType != null && !preferredType.isBlank()) {
            criteria = new Criteria().andOperator(criteria, Criteria.where("type").is(preferredType));
        }

        Query q = new Query(criteria);
        List<Region> matches = mongoTemplate.find(q, Region.class, "regions");
        matches.sort(Comparator.comparingDouble(this::approxArea));
        return matches;
    }

    private double approxArea(Region r) {
        if (r.getBbox() != null && r.getBbox().length == 4) {
            double w = r.getBbox()[2] - r.getBbox()[0];
            double h = r.getBbox()[3] - r.getBbox()[1];
            return Math.abs(w * h);
        }
        return Double.MAX_VALUE;
    }

    public List<Region> getAllRegions() {
    }
}