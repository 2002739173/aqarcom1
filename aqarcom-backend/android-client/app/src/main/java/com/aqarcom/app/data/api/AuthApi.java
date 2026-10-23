package com.aqarcom.app.data.api;

import com.aqarcom.app.data.model.*;

import retrofit2.Call;
import retrofit2.http.*;

/** FR-01 → FR-04 */
public interface AuthApi {
    @POST("auth/register")
    Call<ApiResponse<AuthResult>> register(@Body RegisterRequest body);

    @POST("auth/login")
    Call<ApiResponse<AuthResult>> login(@Body LoginRequest body);

    @POST("auth/refresh")
    Call<ApiResponse<AuthResult>> refresh(@Body RefreshRequest body);

    @POST("auth/logout")
    Call<ApiResponse<MessageResult>> logout(@Body RefreshRequest body);

    @POST("auth/forgot-password")
    Call<ApiResponse<MessageResult>> forgotPassword(@Body EmailRequest body);

    @POST("auth/reset-password")
    Call<ApiResponse<MessageResult>> resetPassword(@Body ResetPasswordRequest body);

    @GET("auth/me")
    Call<ApiResponse<User>> me();

    @PATCH("auth/me")
    Call<ApiResponse<User>> updateMe(@Body UpdateProfileRequest body);

    @POST("auth/change-password")
    Call<ApiResponse<MessageResult>> changePassword(@Body ChangePasswordRequest body);

    @POST("auth/device-token")
    Call<ApiResponse<MessageResult>> registerDeviceToken(@Body DeviceTokenRequest body);

    @HTTP(method = "DELETE", path = "auth/device-token", hasBody = true)
    Call<ApiResponse<MessageResult>> removeDeviceToken(@Body DeviceTokenRequest body);

    @GET("meta")
    Call<ApiResponse<MetaInfo>> meta();
}
