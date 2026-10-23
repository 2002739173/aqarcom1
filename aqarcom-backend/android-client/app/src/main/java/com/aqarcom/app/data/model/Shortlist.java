package com.aqarcom.app.data.model;

import java.util.List;

/** FR-18 — top 5 offers ranked by WSM score. */
public class Shortlist {
    public String tenderId;
    public String status;
    public String engine;      // wsm | fallback
    public String evaluatedAt;
    public int bidsConsidered;
    public Weights weights;
    public String awardedBidId;
    public List<Item> results;

    public static class Weights { public int price; public int duration; }

    public static class Item {
        public int rank;
        public String bidId;
        public double score;        // 0..1
        public double scorePercent; // 0..100 — show this
        public double normalizedPrice;
        public double normalizedDuration;
        public double totalPrice;
        public int durationDays;
        public String engine;
        public String submittedAt;
        public String notes;
        public Contractor contractor;
    }

    public static class Contractor {
        public String id;
        public String fullName;
        public String companyName;
        public String phone;
        public String email;
    }
}
