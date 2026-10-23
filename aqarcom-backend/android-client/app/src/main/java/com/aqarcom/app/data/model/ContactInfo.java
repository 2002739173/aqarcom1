package com.aqarcom.app.data.model;

/**
 * FR-25. Open with:
 *   startActivity(new Intent(Intent.ACTION_DIAL, Uri.parse(c.telUri)));
 *   startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(c.whatsappUrl)));
 */
public class ContactInfo {
    public String ownerName;
    public String phone;
    public String whatsapp;
    public String telUri;
    public String whatsappUrl;
}
