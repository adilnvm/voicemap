package com.voicemap.backend.service;

import com.voicemap.backend.model.Pincode;
import com.voicemap.backend.repository.PincodeRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class PincodeService {
    private final PincodeRepository repo;

    public PincodeService(PincodeRepository repo) {
        this.repo = repo;
    }

    public Optional<Pincode> findByCode(String code) {
        if (code == null) return Optional.empty();
        return Optional.ofNullable(repo.findByPincode(code));
    }

    public List<Pincode> searchPrefix(String prefix, int limit) {
        if (prefix == null || prefix.isBlank()) return List.of();
        List<Pincode> list = repo.findByPincodeStartingWith(prefix);
        if (list.size() > limit) return list.subList(0, limit);
        return list;
    }

    public Pincode save(Pincode p) {
        return repo.save(p);
    }

    public long count() {
        return repo.count();
    }

    public void deleteAll() {
        repo.deleteAll();
    }
}