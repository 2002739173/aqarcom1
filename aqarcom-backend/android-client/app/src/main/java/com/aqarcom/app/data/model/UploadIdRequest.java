package com.aqarcom.app.data.model;

/** Attach a completed resumable upload as a new spec-book version. */
public class UploadIdRequest {
    public String uploadId;
    public String note;
    public UploadIdRequest(String uploadId, String note) { this.uploadId = uploadId; this.note = note; }
}
