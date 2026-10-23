package com.aqarcom.app.data.model;

public class User {
    public String id;
    public String fullName;
    public String email;
    public String phone;
    public String whatsapp;
    public String role;               // user | property_owner | project_owner | contractor | admin
    public String verificationStatus; // none | pending | verified | rejected
    public String companyName;
    public String city;
    /**
     * pending   → registered with a privileged role, waiting for admin approval on the dashboard (no privileges yet)
     * active    → approved
     * rejected  → approval refused (cannot log in)
     * suspended → blocked by the admin (cannot log in)
     */
    public String status;

    public boolean isPendingApproval() { return "pending".equals(status); }
    public String createdAt;
}
