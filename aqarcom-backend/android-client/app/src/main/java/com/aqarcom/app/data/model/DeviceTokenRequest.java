package com.aqarcom.app.data.model;

public class DeviceTokenRequest {
    public String token;
    public String platform = "android";
    public DeviceTokenRequest(String token) { this.token = token; }
}
