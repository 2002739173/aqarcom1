package com.aqarcom.app.data.network;

import java.io.IOException;

import okhttp3.Interceptor;
import okhttp3.Request;
import okhttp3.Response;

/** Adds "Authorization: Bearer <token>" to every request when logged in. */
public class AuthInterceptor implements Interceptor {
    private final TokenManager tokens;

    public AuthInterceptor(TokenManager tokens) { this.tokens = tokens; }

    @Override
    public Response intercept(Chain chain) throws IOException {
        Request req = chain.request();
        String token = tokens.getAccessToken();
        if (token != null && req.header("Authorization") == null) {
            req = req.newBuilder().header("Authorization", "Bearer " + token).build();
        }
        return chain.proceed(req);
    }
}
