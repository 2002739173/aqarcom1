package com.aqarcom.app.data.model;

public class Tender {
    public String id;
    public String title;
    public String description;
    public String tenderType;   // construction | finishing | partnership
    public String city;
    public String address;
    public Double latitude;
    public Double longitude;
    public Double estimatedBudget;
    public int priceWeight;
    public int durationWeight;
    public String deadline;       // ISO UTC — server clock is authoritative
    public String originalDeadline;
    public boolean extensionUsed;
    /** draft | open | evaluating | shortlist_ready | awarded | closed_no_bids | cancelled */
    public String status;
    public String publishedAt;
    public String closedAt;
    public Evaluation evaluation;
    public String awardedBid;
    public int currentDocumentVersion;
    public TenderDocument currentDocument;
    public Integer activeBidsCount; // owner / admin only
    public OwnerInfo owner;
    public String serverTime;
    /** Countdown computed by the server — prefer it over the phone clock. */
    public long secondsRemaining;
    public boolean isMine;
    public Bid myBid;   // contractor only
    public Boolean canBid; // contractor only
    public String cancelReason;
    public String createdAt;

    public static class Evaluation {
        public String engine; // wsm | fallback
        public String evaluatedAt;
        public Integer bidsConsidered;
    }
}
