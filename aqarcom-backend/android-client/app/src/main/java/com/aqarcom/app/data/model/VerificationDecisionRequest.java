package com.aqarcom.app.data.model;

public class VerificationDecisionRequest {
    public String decision; // approve | reject
    public String reason;   // mandatory for reject
    public VerificationDecisionRequest(String decision, String reason) { this.decision = decision; this.reason = reason; }
}
