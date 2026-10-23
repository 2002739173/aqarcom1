package com.aqarcom.app.data.network;

import com.aqarcom.app.data.model.ApiResponse;
import com.aqarcom.app.data.model.AuthResult;
import com.aqarcom.app.data.model.RefreshRequest;

import java.io.IOException;

import okhttp3.Authenticator;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.Route;

/**
 * Called by OkHttp on HTTP 401. Refreshes the access token once (single-use refresh tokens)
 * and retries the original request. If refresh fails → clear session (app should go to login).
 */
public class TokenAuthenticator implements Authenticator {
    private final TokenManager tokens;
    private final SessionListener listener;

    public interface SessionListener { void onSessionExpired(); }

    public TokenAuthenticator(TokenManager tokens, SessionListener listener) {
        this.tokens = tokens;
        this.listener = listener;
    }

    @Override
    public synchronized Request authenticate(Route route, Response response) throws IOException {
        String path = response.request().url().encodedPath();
        if (path.endsWith("/auth/login") || path.endsWith("/auth/refresh")) return null;
        if (responseCount(response) >= 2) return null;

        String sentToken = response.request().header("Authorization");
        String current = tokens.getAccessToken();
        // another thread already refreshed → just retry with the new token
        if (current != null && sentToken != null && !sentToken.equals("Bearer " + current)) {
            return response.request().newBuilder().header("Authorization", "Bearer " + current).build();
        }

        String refresh = tokens.getRefreshToken();
        if (refresh == null) return null;

        retrofit2.Response<ApiResponse<AuthResult>> r = ApiClient.refreshApi()
                .refresh(new RefreshRequest(refresh)).execute();
        if (r.isSuccessful() && r.body() != null && r.body().data != null) {
            tokens.save(r.body().data);
            return response.request().newBuilder()
                    .header("Authorization", "Bearer " + r.body().data.accessToken).build();
        }
        tokens.clear();
        if (listener != null) listener.onSessionExpired();
        return null;
    }

    private int responseCount(Response response) {
        int n = 1;
        while ((response = response.priorResponse()) != null) n++;
        return n;
    }
}
