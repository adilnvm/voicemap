package com.voicemap.backend.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.geo.GeoJsonMultiPolygon;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.Map;

@Document(collection = "regions")
public class Region {

    @Id
    private String id;

    private String name;
    private String code;
    private String type;       // state | district | pc | ac | ward
    private String state;
    private String district;
    private GeoJsonMultiPolygon geo;
    private double[] centroid; // [lon, lat]
    private double[] bbox;     // [minLon, minLat, maxLon, maxLat]
    private String parentId;
    private Map<String, Object> meta;
    private Instant createdAt;
    private String source;
    private Integer sourceYear;
    private boolean verified = false;

    public Region() {}

    // --- getters & setters ---
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }

    public String getDistrict() { return district; }
    public void setDistrict(String district) { this.district = district; }

    public GeoJsonMultiPolygon getGeo() { return geo; }
    public void setGeo(GeoJsonMultiPolygon geo) { this.geo = geo; }

    public double[] getCentroid() { return centroid; }
    public void setCentroid(double[] centroid) { this.centroid = centroid; }

    public double[] getBbox() { return bbox; }
    public void setBbox(double[] bbox) { this.bbox = bbox; }

    public String getParentId() { return parentId; }
    public void setParentId(String parentId) { this.parentId = parentId; }

    public Map<String, Object> getMeta() { return meta; }
    public void setMeta(Map<String, Object> meta) { this.meta = meta; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }

    public Integer getSourceYear() { return sourceYear; }
    public void setSourceYear(Integer sourceYear) { this.sourceYear = sourceYear; }

    public boolean isVerified() { return verified; }
    public void setVerified(boolean verified) { this.verified = verified; }
}