package com.aqarcom.app.data.api;

import com.aqarcom.app.data.model.*;

import java.util.List;
import java.util.Map;

import okhttp3.MultipartBody;
import okhttp3.RequestBody;
import okhttp3.ResponseBody;
import retrofit2.Call;
import retrofit2.http.*;

/** FR-10 → FR-21. Whole section returns 403 for role "user" / "property_owner" (NFR-04). */
public interface TenderApi {

    /** filters: status (default open), tenderType, city, q, sort (newest | deadline), page, limit */
    @GET("tenders")
    Call<ApiResponse<List<Tender>>> list(@QueryMap Map<String, String> filters);

    @GET("tenders/mine")
    Call<ApiResponse<List<Tender>>> mine(@QueryMap Map<String, String> filters);

    @GET("tenders/{id}")
    Call<ApiResponse<Tender>> get(@Path("id") String id);

    /** Creates a DRAFT. Then upload a spec book, then publish. */
    @POST("tenders")
    Call<ApiResponse<Tender>> create(@Body TenderRequest body);

    @PATCH("tenders/{id}")
    Call<ApiResponse<Tender>> update(@Path("id") String id, @Body TenderRequest body);

    @POST("tenders/{id}/publish")
    Call<ApiResponse<Tender>> publish(@Path("id") String id);

    /** FR-14 — once only, later than the current deadline. */
    @POST("tenders/{id}/extend")
    Call<ApiResponse<Tender>> extend(@Path("id") String id, @Body DeadlineRequest body);

    @POST("tenders/{id}/cancel")
    Call<ApiResponse<Tender>> cancel(@Path("id") String id, @Body ReasonRequest body);

    // ---- Spec book (FR-11, FR-15) ----

    /** Direct upload (≤ 20 MB, PDF/Word). Field name "file"; note = MultipartUtil.text("...") or null. */
    @Multipart
    @POST("tenders/{id}/documents")
    Call<ApiResponse<TenderDocument>> uploadDocument(@Path("id") String id, @Part MultipartBody.Part file, @Part("note") RequestBody note);

    /** Attach a completed resumable upload (see ChunkedUploader). */
    @POST("tenders/{id}/documents")
    Call<ApiResponse<TenderDocument>> attachUploadedDocument(@Path("id") String id, @Body UploadIdRequest body);

    @GET("tenders/{id}/documents")
    Call<ApiResponse<List<TenderDocument>>> documents(@Path("id") String id);

    @Streaming
    @GET("tenders/{id}/documents/latest/download")
    Call<ResponseBody> downloadLatest(@Path("id") String id);

    @Streaming
    @GET("tenders/{id}/documents/{version}/download")
    Call<ResponseBody> downloadVersion(@Path("id") String id, @Path("version") int version);

    // ---- Bids ----

    /** FR-12 — 403 CONTRACTOR_NOT_VERIFIED → open verification screen; 409 TENDER_CLOSED / BID_EXISTS. */
    @POST("tenders/{id}/bids")
    Call<ApiResponse<Bid>> submitBid(@Path("id") String id, @Body BidRequest body);

    /** Owner / admin. Contents visible only after closing. */
    @GET("tenders/{id}/bids")
    Call<ApiResponse<TenderBids>> bids(@Path("id") String id);

    // ---- Evaluation & award ----

    @GET("tenders/{id}/shortlist")
    Call<ApiResponse<Shortlist>> shortlist(@Path("id") String id);

    @POST("tenders/{id}/award")
    Call<ApiResponse<Tender>> award(@Path("id") String id, @Body AwardRequest body);
}
