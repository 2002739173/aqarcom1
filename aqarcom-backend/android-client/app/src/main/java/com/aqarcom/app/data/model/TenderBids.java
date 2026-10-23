package com.aqarcom.app.data.model;

import java.util.List;

/** GET /tenders/{id}/bids — contents visible only after closing. */
public class TenderBids {
    public boolean visible;
    public int activeBidsCount;
    public List<Item> items;

    public static class Item {
        public String id;
        public OwnerInfo contractor;
        public double totalPrice;
        public int durationDays;
        public String notes;
        public String submittedAt;
        public boolean isWithdrawn;
        public String outcome;
    }
}
