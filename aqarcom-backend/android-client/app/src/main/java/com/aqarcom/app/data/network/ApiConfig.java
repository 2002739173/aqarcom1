package com.aqarcom.app.data.network;

/**
 * Server address.
 *  - Android emulator → the host PC is 10.0.2.2
 *  - Real phone on the same Wi-Fi → use your PC's LAN IP (e.g. http://192.168.1.10:3000/api/v1/)
 *  - Production → https://api.your-domain/api/v1/
 * Must end with "/".
 */
public final class ApiConfig {
    public static final String BASE_URL = "http://10.0.2.2:3000/api/v1/";
    public static final int CONNECT_TIMEOUT_SEC = 20;
    public static final int READ_TIMEOUT_SEC = 60;
    public static final int WRITE_TIMEOUT_SEC = 120; // large spec-book uploads (NFR-01)

    private ApiConfig() {}
}
