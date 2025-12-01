package com.voicemap.backend.repository;

import com.voicemap.backend.model.Region;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface RegionRepository extends MongoRepository<Region, String> {
    List<Region> findByType(String type);
    List<Region> findByTypeAndState(String type, String state);
    List<Region> findByNameRegexIgnoreCase(String regex);
    Optional<Region> findByTypeAndNameIgnoreCase(String type, String name);
}