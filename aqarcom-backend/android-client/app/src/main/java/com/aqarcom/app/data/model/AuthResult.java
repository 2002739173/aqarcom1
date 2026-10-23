package com.aqarcom.app.data.model;

public class AuthResult {
    public User user;
    public String accessToken;
    public String refreshToken;
    public String tokenType;
    public long expiresIn;
    public String refreshExpiresAt;
}
