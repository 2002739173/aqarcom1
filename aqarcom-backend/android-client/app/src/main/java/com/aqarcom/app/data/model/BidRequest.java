package com.aqarcom.app.data.model;

public class BidRequest {
    public Double totalPrice;   // > 0
    public Integer durationDays; // ≥ 1
    public String notes;
    public BidRequest(Double totalPrice, Integer durationDays, String notes) {
        this.totalPrice = totalPrice; this.durationDays = durationDays; this.notes = notes;
    }
}
