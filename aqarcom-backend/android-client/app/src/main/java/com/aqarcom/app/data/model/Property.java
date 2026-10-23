package com.aqarcom.app.data.model;

import java.util.List;

public class Property {
    public String id;
    public String title;
    public String description;
    public String propertyType; // apartment | house | villa | land | shop | office | building | farm | warehouse
    public String purpose;      // sale | rent | investment
    public double price;
    public String currency;     // SYP | USD
    public double area;
    public int rooms;
    public int bathrooms;
    public Integer floor;
    public String city;
    public String district;
    public String address;
    public double latitude;
    public double longitude;
    public List<ImageItem> images;
    public String thumbnailUrl;
    public String status;       // active | hidden | deleted
    public OwnerInfo owner;
    /** true for visitors → disable Call / WhatsApp buttons (TC-09). */
    public boolean contactLocked;
    public boolean isFavorite;
    public boolean isMine;
    public Integer distanceMeters; // only with sort=nearest
    public int viewsCount;
    public String createdAt;
    public String updatedAt;
}
