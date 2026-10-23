package com.aqarcom.app.data.model;

import java.util.List;

/** GET /meta — spinner values, limits and authoritative server time. */
public class MetaInfo {
    public String serverTime;
    public List<String> roles;
    public List<String> propertyTypes;
    public List<String> listingPurposes;
    public List<String> currencies;
    public List<String> tenderTypes;
    public List<String> tenderStatuses;
    public Limits limits;

    public static class Limits {
        public int tenderDocMaxMb;
        public int propertyImagesMax;
        public int propertyImageMaxMb;
        public int verificationDocMaxMb;
        public int uploadChunkMaxMb;
    }
}
