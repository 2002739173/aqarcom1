package com.aqarcom.app.data.model;

/** Item of GET /bids/mine. */
public class BidWithTender {
    public String id;
    public TenderSummary tender;
    public double totalPrice;
    public int durationDays;
    public String notes;
    public String submittedAt;
    public boolean isWithdrawn;
    public String outcome;

    public static class TenderSummary {
        public String id;
        public String title;
        public String status;
        public String deadline;
        public String tenderType;
        public String city;
    }
}
