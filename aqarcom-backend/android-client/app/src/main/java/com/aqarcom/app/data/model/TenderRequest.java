package com.aqarcom.app.data.model;

/** priceWeight + durationWeight must equal 100 (BR-07) — enforce in the slider UI too. */
public class TenderRequest {
    public String title;
    public String description;
    public String tenderType;
    public String city;
    public String address;
    public Double latitude;
    public Double longitude;
    public String property;
    public Double estimatedBudget;
    public Integer priceWeight;
    public Integer durationWeight;
    public String deadline; // ISO-8601, e.g. "2026-11-30T12:00:00Z"
}
