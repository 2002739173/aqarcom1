package com.aqarcom.app.data.model;

import com.google.gson.JsonObject;

/**
 * type: new_bid | bid_won | bid_lost | tender_closed_no_bids | shortlist_ready | tender_document_updated |
 *       tender_extended | tender_cancelled | verification_approved | verification_rejected |
 *       content_hidden | content_deleted | content_restored | account_locked |
 *       account_approved | account_rejected | account_suspended | account_reactivated | role_changed
 *       (on account_approved / role_changed: call GET auth/me to refresh the stored user)
 * data usually carries "tenderId" → open the tender screen on tap.
 */
public class AppNotification {
    public String id;
    public String type;
    public String title;
    public String body;
    public JsonObject data;
    public String readAt;
    public String createdAt;

    public boolean isRead() { return readAt != null; }
}
