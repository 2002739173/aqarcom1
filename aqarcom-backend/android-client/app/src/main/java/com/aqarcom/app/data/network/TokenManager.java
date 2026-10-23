package com.aqarcom.app.data.network;

import android.content.Context;
import android.content.SharedPreferences;

import com.aqarcom.app.data.model.AuthResult;
import com.aqarcom.app.data.model.User;
import com.google.gson.Gson;

/**
 * Stores the JWT pair and the current user.
 * For production consider androidx.security EncryptedSharedPreferences.
 */
public class TokenManager {
    private static final String PREFS = "aqarcom_auth";
    private static final String K_ACCESS = "access_token";
    private static final String K_REFRESH = "refresh_token";
    private static final String K_USER = "user_json";

    private static TokenManager instance;
    private final SharedPreferences prefs;
    private final Gson gson = new Gson();

    private TokenManager(Context ctx) {
        prefs = ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static synchronized TokenManager get(Context ctx) {
        if (instance == null) instance = new TokenManager(ctx);
        return instance;
    }

    public void save(AuthResult r) {
        prefs.edit()
                .putString(K_ACCESS, r.accessToken)
                .putString(K_REFRESH, r.refreshToken)
                .putString(K_USER, gson.toJson(r.user))
                .apply();
    }

    public void saveUser(User u) { prefs.edit().putString(K_USER, gson.toJson(u)).apply(); }

    public String getAccessToken() { return prefs.getString(K_ACCESS, null); }
    public String getRefreshToken() { return prefs.getString(K_REFRESH, null); }

    public User getUser() {
        String json = prefs.getString(K_USER, null);
        return json == null ? null : gson.fromJson(json, User.class);
    }

    public boolean isLoggedIn() { return getAccessToken() != null; }

    /** Role helpers — use them to show / hide the B2B section (NFR-04). */
    public boolean canSeeTenders() {
        User u = getUser();
        return u != null && (Roles.PROJECT_OWNER.equals(u.role) || Roles.CONTRACTOR.equals(u.role) || Roles.ADMIN.equals(u.role));
    }

    public void clear() { prefs.edit().clear().apply(); }

    public static final class Roles {
        public static final String USER = "user";
        public static final String PROPERTY_OWNER = "property_owner";
        public static final String PROJECT_OWNER = "project_owner";
        public static final String CONTRACTOR = "contractor";
        public static final String ADMIN = "admin";
        private Roles() {}
    }
}
