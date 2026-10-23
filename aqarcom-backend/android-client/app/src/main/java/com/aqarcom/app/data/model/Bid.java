package com.aqarcom.app.data.model;

public class Bid {
    public String id;
    /** On /bids/mine this is an object; elsewhere it is the tender id. Use {@link BidWithTender} for /bids/mine. */
    public Object tender;
    public Object contractor;
    public double totalPrice;
    public int durationDays;
    public String notes;
    public String submittedAt;
    public boolean isWithdrawn;
    public String withdrawnAt;
    public String outcome; // pending | won | lost
    public String createdAt;
}
