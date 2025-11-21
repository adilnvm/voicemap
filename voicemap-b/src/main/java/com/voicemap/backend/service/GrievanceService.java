package com.voicemap.backend.service;

import com.voicemap.backend.model.Grievance;
import com.voicemap.backend.model.Region;
import com.voicemap.backend.repository.GrievanceRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Service
public class GrievanceService {

    private final GrievanceRepository grievanceRepository;
    private final RegionService regionService;

    public GrievanceService(GrievanceRepository grievanceRepository, RegionService regionService) {
        this.grievanceRepository = grievanceRepository;
        this.regionService = regionService;
    }

    public Grievance createGrievance(Grievance grievance) {
        grievance.setCreatedAt(Instant.now());
        grievance.setStatus("open");

        // auto-assign regions using location if available
        if (grievance.getLocation() != null) {
            Double lon = grievance.getLocation().getX();
            Double lat = grievance.getLocation().getY();
            if (lon != null && lat != null) {
                // try ward -> ac -> pc -> district -> state
                assignRegionsForPoint(grievance, lat, lon);
            }
        }

        return grievanceRepository.save(grievance);
    }

    public Page<Grievance> find(String district, String category, Pageable pageable) {
        if (district != null && category != null) {
            return grievanceRepository.findByCategoryAndDistrict(category, district, pageable);
        } else if (district != null) {
            return grievanceRepository.findByDistrict(district, pageable);
        } else if (category != null) {
            return grievanceRepository.findByCategory(category, pageable);
        } else {
            return grievanceRepository.findAll(pageable);
        }
    }

    public Optional<Grievance> getGrievanceById(String id) {
        return grievanceRepository.findById(id);
    }

    private void assignRegionsForPoint(Grievance g, double lat, double lon) {
        // Prefer smallest region types in this order
        String[] order = new String[] {"ward", "ac", "pc", "district", "state"};
        for (String t : order) {
            List<Region> matches = regionService.findContaining(lat, lon, t);
            if (matches != null && !matches.isEmpty()) {
                Region match = matches.get(0);
                // Set according to available info
                if ("pc".equalsIgnoreCase(t)) {
                    g.setRegionPcId(match.getId());
                } else if ("ac".equalsIgnoreCase(t)) {
                    g.setRegionAcId(match.getId());
                } else if ("district".equalsIgnoreCase(t)) {
                    g.setRegionDistrictId(match.getId());
                } else if ("state".equalsIgnoreCase(t)) {
                    g.setRegionStateId(match.getId());
                } else if ("ward".equalsIgnoreCase(t)) {
                    // if ward, climb ancestors to set pc/district/state if parentIds set
                    g.setRegionPcId(findAncestorId(match, "pc"));
                    g.setRegionAcId(findAncestorId(match, "ac"));
                    g.setRegionDistrictId(findAncestorId(match, "district"));
                    g.setRegionStateId(findAncestorId(match, "state"));
                }
                // we stop after first match (smallest available)
                break;
            }
        }
    }

    private String findAncestorId(Region start, String desiredType) {
        Region current = start;
        while (current != null) {
            if (desiredType.equalsIgnoreCase(current.getType())) return current.getId();
            if (current.getParentId() == null) break;
            current = regionService.findById(current.getParentId()).orElse(null);
        }
        return null;
    }
}