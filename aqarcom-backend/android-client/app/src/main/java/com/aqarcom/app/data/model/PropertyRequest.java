package com.aqarcom.app.data.model;

/** Body for create (all required fields) and PATCH update (send only changed fields; nulls are omitted by Gson). */
public class PropertyRequest {
    public String title;
    public String description;
    public String propertyType;
    public String purpose;
    public Double price;
    public String currency;
    public Double area;
    public Integer rooms;
    public Integer bathrooms;
    public Integer floor;
    public String city;
    public String district;
    public String address;
    public Double latitude;   // mandatory on create (BR-04)
    public Double longitude;
}
