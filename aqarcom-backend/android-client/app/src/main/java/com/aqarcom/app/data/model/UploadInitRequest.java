package com.aqarcom.app.data.model;

public class UploadInitRequest {
    public String fileName;
    public String mimeType;
    public long totalSize;
    public long chunkSize;
    public UploadInitRequest(String fileName, String mimeType, long totalSize, long chunkSize) {
        this.fileName = fileName; this.mimeType = mimeType; this.totalSize = totalSize; this.chunkSize = chunkSize;
    }
}
