package com.voicemap.backend.model;

import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;
import org.springframework.data.mongodb.core.geo.GeoJsonPoint;

import jakarta.validation.constraints.NotBlank;
import java.time.Instant;

@Document(collection = "grievances")
public class Grievance {

    @Id
    private String id;

    @NotBlank(message = "Title is required")
    private String title;

    private String description;
    private String category;

    @Field("state")
    private String state;

    @Field("district")
    private String district;

    private String status = "open";

    @CreatedDate
    private Instant createdAt = Instant.now();

    // GeoJSON point for [longitude, latitude]
    private GeoJsonPoint location;

    // --- Constructors ---
    public Grievance() {}

    public Grievance(String title, String description, String category,
                     String state, String district, GeoJsonPoint location) {
        this.title = title;
        this.description = description;
        this.category = category;
        this.state = state;
        this.district = district;
        this.location = location;
    }

    // --- Getters & Setters ---
    public String getId() { return id; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }

    public String getDistrict() { return district; }
    public void setDistrict(String district) { this.district = district; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public GeoJsonPoint getLocation() { return location; }
    public void setLocation(GeoJsonPoint location) { this.location = location; }
}
