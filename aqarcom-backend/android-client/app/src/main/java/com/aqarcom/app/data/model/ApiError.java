package com.aqarcom.app.data.model;

import com.google.gson.JsonObject;

/**
 * error.code values worth handling in the UI:
 *  ACCOUNT_PENDING_APPROVAL (show "waiting for approval" screen), ACCOUNT_REJECTED, ACCOUNT_SUSPENDED,
 *  TOKEN_EXPIRED, INVALID_CREDENTIALS, ACCOUNT_LOCKED (details.retryAfterSeconds), VALIDATION_ERROR (details.fields[]),
 *  CONTRACTOR_NOT_VERIFIED (details.redirect = "verification"), TENDER_CLOSED, BID_EXISTS, WEIGHTS_INVALID (details.suggestion),
 *  EXTENSION_ALREADY_USED, FILE_TOO_LARGE, UNSUPPORTED_FILE_TYPE, TENDER_ALREADY_AWARDED, NETWORK_ERROR (client side).
 */
public class ApiError {
    public String code;
    public String message;   // Arabic, ready to show
    public JsonObject details;
    public transient int httpStatus;

    /** Field names to highlight in a form (from details.fields[].field). */
    public java.util.List<String> fieldNames() {
        java.util.List<String> out = new java.util.ArrayList<>();
        if (details != null && details.has("fields")) {
            for (com.google.gson.JsonElement e : details.getAsJsonArray("fields")) {
                out.add(e.getAsJsonObject().get("field").getAsString());
            }
        } else if (details != null && details.has("field")) {
            out.add(details.get("field").getAsString());
        }
        return out;
    }
}
