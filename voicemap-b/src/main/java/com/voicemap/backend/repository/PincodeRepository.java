package com.voicemap.backend.repository;

import com.voicemap.backend.model.Pincode;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PincodeRepository extends MongoRepository<Pincode, String> {
    Pincode findByPincode(String pincode);
    List<Pincode> findByPincodeStartingWith(String prefix); // for simple prefix searches
}