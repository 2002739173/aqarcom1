package com.aqarcom.app.data.model;

public class ResetPasswordRequest {
    public String email;
    public String code;        // 6 digits from the email
    public String newPassword;
    public ResetPasswordRequest(String email, String code, String newPassword) {
        this.email = email; this.code = code; this.newPassword = newPassword;
    }
}
