package com.aqarcom.app.data.model;

import java.util.List;

public class VerificationRequest {
    public String id;
    public Object contractor;
    public List<Doc> documents;
    public String notes;
    public String status; // pending | approved | rejected
    public Object reviewedBy;
    public String reviewedAt;
    public String rejectionReason;
    public String createdAt;

    public static class Doc {
        public String id;
        public String docType; // engineers_syndicate | commercial_register | other
        public String originalName;
        public String mimeType;
        public long sizeBytes;
    }
}
