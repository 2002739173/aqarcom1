package com.aqarcom.app.data.model;

public class ModerateRequest {
    public String action; // hide | delete | restore
    public String reason;
    public ModerateRequest(String action, String reason) { this.action = action; this.reason = reason; }
}
