package com.voicemap.backend.config;

import com.voicemap.backend.model.Grievance;
import com.voicemap.backend.repository.GrievanceRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.core.geo.GeoJsonPoint;

import java.time.Instant;

@Configuration
public class DbSanityCheck {

    @Bean
    CommandLineRunner seedOnce(GrievanceRepository repo) {
        return args -> {
            long count = repo.count();
            System.out.println("Grievance count before seed: " + count);
            // Only seed if empty
            if (count == 0) {
                Grievance g = new Grievance();
                g.setTitle("Sanity check: sample issue");
                g.setDescription("Inserted by CommandLineRunner");
                g.setCategory("Sanity");
                g.setState("TestState");
                g.setDistrict("TestDistrict");
                g.setCreatedAt(Instant.now());
                g.setStatus("open");
                g.setLocation(new GeoJsonPoint(77.5946, 12.9716)); // lon, lat
                repo.save(g);
                System.out.println("Inserted sample grievance: " + g.getTitle());
            }
            System.out.println("Grievance count after seed: " + repo.count());
        };
    }
}
