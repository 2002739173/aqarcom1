package com.aqarcom.app.data.model;

public class RegisterRequest {
    public String fullName;
    public String email;
    public String phone;
    public String whatsapp;
    public String password;
    public String role;        // user | property_owner | project_owner | contractor
    public String companyName; // required for contractor
    public String city;
}
