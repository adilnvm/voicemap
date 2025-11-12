package com.voicemap.backend.repository;

import com.voicemap.backend.model.Grievance;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface GrievanceRepository extends MongoRepository<Grievance, String> {
    Page<Grievance> findByDistrict(String district, Pageable pageable);
    Page<Grievance> findByCategory(String category, Pageable pageable);
    Page<Grievance> findByCategoryAndDistrict(String category, String district, Pageable pageable);
}
