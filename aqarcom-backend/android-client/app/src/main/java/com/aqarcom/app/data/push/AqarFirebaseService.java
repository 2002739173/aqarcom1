package com.aqarcom.app.data.push;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.aqarcom.app.data.model.ApiError;
import com.aqarcom.app.data.model.DeviceTokenRequest;
import com.aqarcom.app.data.model.MessageResult;
import com.aqarcom.app.data.model.PageMeta;
import com.aqarcom.app.data.network.ApiCallback;
import com.aqarcom.app.data.network.ApiClient;
import com.aqarcom.app.data.network.TokenManager;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * Optional FCM receiver (FR-21, FR-26). The server sends notification + data {type, tenderId, notificationId}.
 * Even without FCM, every notification is available from GET /notifications.
 *
 * After login, register the token:
 *   FirebaseMessaging.getInstance().getToken().addOnSuccessListener(AqarFirebaseService::sendTokenToServer);
 */
public class AqarFirebaseService extends FirebaseMessagingService {
    public static final String CHANNEL_ID = "aqarcom_default";

    @Override
    public void onNewToken(@NonNull String token) {
        if (TokenManager.get(this).isLoggedIn()) sendTokenToServer(token);
    }

    public static void sendTokenToServer(String token) {
        ApiClient.auth().registerDeviceToken(new DeviceTokenRequest(token)).enqueue(new ApiCallback<MessageResult>() {
            @Override public void onSuccess(MessageResult r, PageMeta m) {}
            @Override public void onError(ApiError e) {}
        });
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage msg) {
        String title = msg.getNotification() != null ? msg.getNotification().getTitle() : "عقاركم";
        String body = msg.getNotification() != null ? msg.getNotification().getBody() : "";
        String tenderId = msg.getData().get("tenderId");

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "إشعارات عقاركم", NotificationManager.IMPORTANCE_HIGH));
        }
        // TODO: replace MainActivity with your launcher / tender-details activity
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open != null && tenderId != null) open.putExtra("tenderId", tenderId);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info) // replace with your icon
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setContentIntent(pi);
        nm.notify((int) System.currentTimeMillis(), b.build());
    }
}
