package com.voicemap.backend.service;

import com.voicemap.backend.model.Grievance;
import com.voicemap.backend.repository.GrievanceRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Optional;

@Service
public class GrievanceService {

    private final GrievanceRepository grievanceRepository;

    public GrievanceService(GrievanceRepository grievanceRepository) {
        this.grievanceRepository = grievanceRepository;
    }

    public Grievance createGrievance(Grievance grievance) {
        grievance.setCreatedAt(Instant.now());
        grievance.setStatus("open");
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
}
