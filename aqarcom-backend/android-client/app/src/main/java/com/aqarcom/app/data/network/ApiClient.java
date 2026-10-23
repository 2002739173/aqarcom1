package com.aqarcom.app.data.network;

import android.content.Context;

import com.aqarcom.app.data.api.AdminApi;
import com.aqarcom.app.data.api.AuthApi;
import com.aqarcom.app.data.api.BidApi;
import com.aqarcom.app.data.api.NotificationApi;
import com.aqarcom.app.data.api.PropertyApi;
import com.aqarcom.app.data.api.TenderApi;
import com.aqarcom.app.data.api.UploadApi;
import com.aqarcom.app.data.api.VerificationApi;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.logging.HttpLoggingInterceptor;
import retrofit2.Retrofit;
import retrofit2.converter.gson.GsonConverterFactory;

/**
 * Single Retrofit instance. Call ApiClient.init(context) once in Application.onCreate().
 *
 * Usage:  ApiClient.properties().search(...).enqueue(callback);
 */
public final class ApiClient {
    private static Retrofit retrofit;
    private static Retrofit plainRetrofit; // without authenticator — used for /auth/refresh
    private static TokenAuthenticator.SessionListener sessionListener;

    public static final Gson GSON = new GsonBuilder()
            .setDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'") // dates are kept as ISO strings in the models
            .create();

    private ApiClient() {}

    public static void init(Context context) { init(context, null); }

    public static synchronized void init(Context context, TokenAuthenticator.SessionListener onSessionExpired) {
        sessionListener = onSessionExpired;
        TokenManager tokens = TokenManager.get(context);

        HttpLoggingInterceptor log = new HttpLoggingInterceptor();
        log.setLevel(HttpLoggingInterceptor.Level.BASIC); // use BODY while debugging (never in release)

        OkHttpClient plainClient = new OkHttpClient.Builder()
                .connectTimeout(ApiConfig.CONNECT_TIMEOUT_SEC, TimeUnit.SECONDS)
                .readTimeout(ApiConfig.READ_TIMEOUT_SEC, TimeUnit.SECONDS)
                .addInterceptor(log)
                .build();
        plainRetrofit = new Retrofit.Builder()
                .baseUrl(ApiConfig.BASE_URL)
                .client(plainClient)
                .addConverterFactory(GsonConverterFactory.create(GSON))
                .build();

        OkHttpClient client = new OkHttpClient.Builder()
                .connectTimeout(ApiConfig.CONNECT_TIMEOUT_SEC, TimeUnit.SECONDS)
                .readTimeout(ApiConfig.READ_TIMEOUT_SEC, TimeUnit.SECONDS)
                .writeTimeout(ApiConfig.WRITE_TIMEOUT_SEC, TimeUnit.SECONDS)
                .addInterceptor(new AuthInterceptor(tokens))
                .addInterceptor(log)
                .authenticator(new TokenAuthenticator(tokens, sessionListener))
                .build();
        retrofit = new Retrofit.Builder()
                .baseUrl(ApiConfig.BASE_URL)
                .client(client)
                .addConverterFactory(GsonConverterFactory.create(GSON))
                .build();
    }

    private static Retrofit r() {
        if (retrofit == null) throw new IllegalStateException("Call ApiClient.init(context) in Application.onCreate()");
        return retrofit;
    }

    static AuthApi refreshApi() { return plainRetrofit.create(AuthApi.class); }

    public static AuthApi auth() { return r().create(AuthApi.class); }
    public static PropertyApi properties() { return r().create(PropertyApi.class); }
    public static TenderApi tenders() { return r().create(TenderApi.class); }
    public static BidApi bids() { return r().create(BidApi.class); }
    public static UploadApi uploads() { return r().create(UploadApi.class); }
    public static VerificationApi verification() { return r().create(VerificationApi.class); }
    public static NotificationApi notifications() { return r().create(NotificationApi.class); }
    public static AdminApi admin() { return r().create(AdminApi.class); }
}
