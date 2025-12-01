package com.voicemap.backend.model;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.GeoSpatialIndexed;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.geo.GeoJsonPoint;


@Document(collection = "pincodes")
public class Pincode {
    @Id
    private String id;

    @Indexed(unique = true)
    private String pincode; // "110001"

    private String officeName;
    private String division;
    private String region;
    private String circle;

    // store as GeoJSON Point (lon, lat)
    @GeoSpatialIndexed //(type = GeoSpatialIndexed.GeoSpatialIndexType.GEO_2DSPHERE)
    private GeoJsonPoint location;

    public Pincode() {}

    // getters & setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getPincode() { return pincode; }
    public void setPincode(String pincode) { this.pincode = pincode; }

    public String getOfficeName() { return officeName; }
    public void setOfficeName(String officeName) { this.officeName = officeName; }

    public String getDivision() { return division; }
    public void setDivision(String division) { this.division = division; }

    public String getRegion() { return region; }
    public void setRegion(String region) { this.region = region; }

    public String getCircle() { return circle; }
    public void setCircle(String circle) { this.circle = circle; }

    public GeoJsonPoint getLocation() { return location; }
    public void setLocation(GeoJsonPoint location) { this.location = location; }
}