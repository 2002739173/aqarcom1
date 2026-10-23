package com.aqarcom.app.data.api;

import com.aqarcom.app.data.model.*;

import okhttp3.MultipartBody;
import okhttp3.RequestBody;
import retrofit2.Call;
import retrofit2.http.*;

/** FR-22 — contractor uploads syndicate certificate and/or commercial register (PDF or image). */
public interface VerificationApi {
    /** Parts: MultipartUtil.part(ctx, "engineers_syndicate", uri, null) / "commercial_register" / "other". Pass null for absent ones. */
    @Multipart
    @POST("verification")
    Call<ApiResponse<VerificationRequest>> submit(@Part MultipartBody.Part engineersSyndicate,
                                                  @Part MultipartBody.Part commercialRegister,
                                                  @Part MultipartBody.Part other,
                                                  @Part("notes") RequestBody notes);

    @GET("verification/me")
    Call<ApiResponse<VerificationStatus>> me();
}
