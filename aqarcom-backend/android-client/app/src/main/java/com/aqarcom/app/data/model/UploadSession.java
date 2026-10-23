package com.aqarcom.app.data.model;

import java.util.List;

public class UploadSession {
    public String id;
    public String fileName;
    public String mimeType;
    public long totalSize;
    public long chunkSize;
    public int totalChunks;
    public List<Integer> receivedChunks;
    public List<Integer> missingChunks;
    public boolean complete;
}
