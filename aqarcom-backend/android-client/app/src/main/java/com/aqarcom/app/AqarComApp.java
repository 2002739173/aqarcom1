package com.aqarcom.app;

import android.app.Application;

import com.aqarcom.app.data.network.ApiClient;

/** Register in AndroidManifest: <application android:name=".AqarComApp" ...> */
public class AqarComApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        ApiClient.init(this, () -> {
            // refresh token expired → send the user to the login screen
            // Intent i = new Intent(this, LoginActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            // startActivity(i);
        });
    }
}
