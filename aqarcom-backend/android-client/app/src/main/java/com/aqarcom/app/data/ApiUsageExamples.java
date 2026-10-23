package com.aqarcom.app.data;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;

import com.aqarcom.app.data.model.*;
import com.aqarcom.app.data.network.ApiCallback;
import com.aqarcom.app.data.network.ApiClient;
import com.aqarcom.app.data.network.MultipartUtil;
import com.aqarcom.app.data.network.TokenManager;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import okhttp3.MultipartBody;

/**
 * Copy-paste examples for each screen. Not meant to be called as-is — move each snippet
 * into its Activity / ViewModel. All callbacks run on the main thread (Retrofit enqueue).
 */
public final class ApiUsageExamples {
    private static final String TAG = "AqarCom";
    private ApiUsageExamples() {}

    // ---------------- Login screen ----------------
    public static void login(Context ctx, String email, String password) {
        ApiClient.auth().login(new LoginRequest(email, password)).enqueue(new ApiCallback<AuthResult>() {
            @Override public void onSuccess(AuthResult r, PageMeta m) {
                TokenManager.get(ctx).save(r);
                if (r.user.isPendingApproval()) {
                    // show "حسابك بانتظار موافقة الإدارة" screen — every privileged call returns 403 ACCOUNT_PENDING_APPROVAL
                    return;
                }
                // r.user.role decides which home screen / whether the tenders tab is visible
            }
            @Override public void onError(ApiError e) {
                if ("ACCOUNT_LOCKED".equals(e.code)) {
                    int secs = e.details.get("retryAfterSeconds").getAsInt();
                    Log.w(TAG, "locked for " + secs + "s");
                }
                Log.e(TAG, e.message); // show e.message in a Snackbar
            }
        });
    }

    // ---------------- Register ----------------
    public static void registerContractor(Context ctx) {
        RegisterRequest r = new RegisterRequest();
        r.fullName = "أحمد الحمصي";
        r.email = "ahmad@example.com";
        r.phone = "+963944123456";
        r.password = "Passw0rd1";
        r.role = TokenManager.Roles.CONTRACTOR;
        r.companyName = "مكتب الحمصي الهندسي";
        ApiClient.auth().register(r).enqueue(new ApiCallback<AuthResult>() {
            @Override public void onSuccess(AuthResult a, PageMeta m) { TokenManager.get(ctx).save(a); }
            @Override public void onError(ApiError e) { List<String> badFields = e.fieldNames(); /* highlight them */ }
        });
    }

    // ---------------- Home: search properties (FR-08) ----------------
    public static void search() {
        Map<String, String> f = new HashMap<>();
        f.put("city", "دمشق");
        f.put("purpose", "rent");
        f.put("maxPrice", "600");
        f.put("minRooms", "2");
        f.put("sort", "price_asc"); // newest | price_asc | price_desc | nearest (+ latitude, longitude)
        f.put("page", "1");
        ApiClient.properties().search(f).enqueue(new ApiCallback<List<Property>>() {
            @Override public void onSuccess(List<Property> list, PageMeta meta) { /* adapter.submit(list); meta.totalPages */ }
            @Override public void onError(ApiError e) { }
        });
    }

    // ---------------- Map screen (FR-07) ----------------
    // googleMap.setOnCameraIdleListener(() -> { LatLngBounds b = googleMap.getProjection().getVisibleRegion().latLngBounds; loadPins(b...); });
    public static void loadPins(double swLat, double swLng, double neLat, double neLng) {
        ApiClient.properties().mapPins(swLat, swLng, neLat, neLng, new HashMap<>()).enqueue(new ApiCallback<List<MapPin>>() {
            @Override public void onSuccess(List<MapPin> pins, PageMeta m) { /* add markers at pin.latitude, pin.longitude */ }
            @Override public void onError(ApiError e) { /* SRS 2-1: fall back to the text list + inform the user */ }
        });
    }

    // ---------------- Property details: Call / WhatsApp (FR-25) ----------------
    public static void contactOwner(Context ctx, Property p, boolean whatsapp) {
        if (p.contactLocked) { /* visitor: buttons disabled → ask to log in (TC-09) */ return; }
        ApiClient.properties().contact(p.id).enqueue(new ApiCallback<ContactInfo>() {
            @Override public void onSuccess(ContactInfo c, PageMeta m) {
                Intent i = whatsapp ? new Intent(Intent.ACTION_VIEW, Uri.parse(c.whatsappUrl))
                                    : new Intent(Intent.ACTION_DIAL, Uri.parse(c.telUri));
                ctx.startActivity(i);
            }
            @Override public void onError(ApiError e) { }
        });
    }

    // ---------------- Add listing + images (FR-05) ----------------
    public static void publishListing(Context ctx, List<Uri> images) {
        PropertyRequest r = new PropertyRequest();
        r.title = "شقة مفروشة في المالكي";
        r.propertyType = "apartment";
        r.purpose = "rent";
        r.price = 450.0;
        r.currency = "USD";
        r.area = 140.0;
        r.rooms = 3;
        r.city = "دمشق";
        r.latitude = 33.5205;  // from the map picker — mandatory (BR-04)
        r.longitude = 36.2803;
        ApiClient.properties().create(r).enqueue(new ApiCallback<Property>() {
            @Override public void onSuccess(Property p, PageMeta m) {
                try {
                    List<MultipartBody.Part> parts = new ArrayList<>();
                    for (Uri u : images) parts.add(MultipartUtil.part(ctx, "images", u, null));
                    ApiClient.properties().uploadImages(p.id, parts).enqueue(new ApiCallback<Property>() {
                        @Override public void onSuccess(Property updated, PageMeta m2) { }
                        @Override public void onError(ApiError e) { }
                    });
                } catch (Exception ex) { Log.e(TAG, "read image failed", ex); }
            }
            @Override public void onError(ApiError e) { }
        });
    }

    // ---------------- Project owner: create → upload spec book → publish (FR-10, FR-11) ----------------
    public static void createTender(Context ctx, Uri specBook, int priceWeightFromSlider) {
        TenderRequest t = new TenderRequest();
        t.title = "إكساء بناء سكني في المزة";
        t.tenderType = "finishing";
        t.city = "دمشق";
        t.priceWeight = priceWeightFromSlider;           // one slider locked to 100% (SRS 3-1)
        t.durationWeight = 100 - priceWeightFromSlider;
        t.deadline = "2026-11-30T12:00:00Z";
        ApiClient.tenders().create(t).enqueue(new ApiCallback<Tender>() {
            @Override public void onSuccess(Tender draft, PageMeta m) {
                try {
                    MultipartBody.Part file = MultipartUtil.part(ctx, "file", specBook,
                            (written, total) -> { /* progressBar.setProgress((int)(written*100/total)) — off main thread */ });
                    ApiClient.tenders().uploadDocument(draft.id, file, null).enqueue(new ApiCallback<TenderDocument>() {
                        @Override public void onSuccess(TenderDocument d, PageMeta m2) {
                            ApiClient.tenders().publish(draft.id).enqueue(new ApiCallback<Tender>() {
                                @Override public void onSuccess(Tender open, PageMeta m3) { }
                                @Override public void onError(ApiError e) { }
                            });
                        }
                        @Override public void onError(ApiError e) { /* FILE_TOO_LARGE / UNSUPPORTED_FILE_TYPE */ }
                    });
                } catch (Exception ex) { Log.e(TAG, "read file failed", ex); }
            }
            @Override public void onError(ApiError e) { /* WEIGHTS_INVALID → e.details.suggestion */ }
        });
        // For large files on weak connections use: new ChunkedUploader(ctx).upload(tenderId, uri, note, listener)
    }

    // ---------------- Contractor: submit bid (FR-12) ----------------
    public static void submitBid(String tenderId, double price, int days) {
        ApiClient.tenders().submitBid(tenderId, new BidRequest(price, days, null)).enqueue(new ApiCallback<Bid>() {
            @Override public void onSuccess(Bid b, PageMeta m) { }
            @Override public void onError(ApiError e) {
                switch (String.valueOf(e.code)) {
                    case "CONTRACTOR_NOT_VERIFIED": /* open VerificationActivity (TC-01) */ break;
                    case "TENDER_CLOSED": /* "انتهى موعد الإغلاق" (TC-02) */ break;
                    case "BID_EXISTS": /* go to edit bid */ break;
                    default: /* toast(e.message) */
                }
            }
        });
    }

    // ---------------- Contractor: verification upload (FR-22) ----------------
    public static void submitVerification(Context ctx, Uri syndicateCert, Uri commercialRegister) throws Exception {
        MultipartBody.Part a = syndicateCert == null ? null : MultipartUtil.part(ctx, "engineers_syndicate", syndicateCert, null);
        MultipartBody.Part b = commercialRegister == null ? null : MultipartUtil.part(ctx, "commercial_register", commercialRegister, null);
        ApiClient.verification().submit(a, b, null, null).enqueue(new ApiCallback<VerificationRequest>() {
            @Override public void onSuccess(VerificationRequest r, PageMeta m) { /* status = pending */ }
            @Override public void onError(ApiError e) { }
        });
    }

    // ---------------- Project owner: shortlist + award (FR-18, FR-20) ----------------
    public static void showShortlistAndAward(String tenderId) {
        ApiClient.tenders().shortlist(tenderId).enqueue(new ApiCallback<Shortlist>() {
            @Override public void onSuccess(Shortlist s, PageMeta m) {
                // s.results sorted by rank; show scorePercent, totalPrice, durationDays, contractor.companyName
                // s.engine == "fallback" → small label "تم الفرز بالمقيّم الاحتياطي"
                String best = s.results.get(0).bidId;
                ApiClient.tenders().award(tenderId, new AwardRequest(best)).enqueue(new ApiCallback<Tender>() {
                    @Override public void onSuccess(Tender t, PageMeta m2) { /* t.status == "awarded" */ }
                    @Override public void onError(ApiError e) { /* TENDER_ALREADY_AWARDED (TC-13) */ }
                });
            }
            @Override public void onError(ApiError e) { /* SHORTLIST_NOT_READY while open */ }
        });
    }

    // ---------------- Notifications badge ----------------
    public static void loadNotifications() {
        ApiClient.notifications().list(1, 20, null).enqueue(new ApiCallback<List<AppNotification>>() {
            @Override public void onSuccess(List<AppNotification> list, PageMeta meta) { /* badge = meta.unread */ }
            @Override public void onError(ApiError e) { }
        });
    }
}
