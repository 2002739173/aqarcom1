package com.aqarcom.app.data.api;

import com.aqarcom.app.data.model.*;
import com.google.gson.JsonObject;

import java.util.List;
import java.util.Map;

import okhttp3.ResponseBody;
import retrofit2.Call;
import retrofit2.http.*;

/**
 * Read-only / moderation admin calls — FR-27, FR-28. Raw JsonObject is used where the admin views are generic.
 * Account approval, rejection, suspension and role changes are intentionally NOT exposed to the Android app:
 * they are done exclusively from the web admin dashboard (/dashboard).
 */
public interface AdminApi {
    @GET("admin/stats")
    Call<ApiResponse<JsonObject>> stats();

    /** type = property | tender ; status = active | hidden | deleted */
    @GET("admin/review-queue")
    Call<ApiResponse<List<JsonObject>>> reviewQueue(@QueryMap Map<String, String> filters);

    @POST("admin/properties/{id}/moderate")
    Call<ApiResponse<JsonObject>> moderateProperty(@Path("id") String id, @Body ModerateRequest body);

    @POST("admin/tenders/{id}/moderate")
    Call<ApiResponse<JsonObject>> moderateTender(@Path("id") String id, @Body ModerateRequest body);

    @GET("admin/users")
    Call<ApiResponse<List<User>>> users(@QueryMap Map<String, String> filters);

    @GET("admin/verifications")
    Call<ApiResponse<List<JsonObject>>> verifications(@Query("status") String status, @Query("page") Integer page);

    @GET("admin/verifications/{id}")
    Call<ApiResponse<JsonObject>> verification(@Path("id") String id);

    @Streaming
    @GET("admin/verifications/{id}/documents/{docId}")
    Call<ResponseBody> verificationDocument(@Path("id") String id, @Path("docId") String docId);

    @POST("admin/verifications/{id}/decision")
    Call<ApiResponse<VerificationRequest>> decide(@Path("id") String id, @Body VerificationDecisionRequest body);
}
