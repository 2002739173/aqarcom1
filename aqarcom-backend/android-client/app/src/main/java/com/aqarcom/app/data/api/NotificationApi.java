package com.aqarcom.app.data.api;

import com.aqarcom.app.data.model.*;

import java.util.List;

import retrofit2.Call;
import retrofit2.http.*;

public interface NotificationApi {
    /** meta.unread holds the badge count. */
    @GET("notifications")
    Call<ApiResponse<List<AppNotification>>> list(@Query("page") Integer page, @Query("limit") Integer limit,
                                                  @Query("unreadOnly") Boolean unreadOnly);

    @GET("notifications/unread-count")
    Call<ApiResponse<MessageResult>> unreadCount();

    @POST("notifications/{id}/read")
    Call<ApiResponse<AppNotification>> markRead(@Path("id") String id);

    @POST("notifications/read-all")
    Call<ApiResponse<MessageResult>> markAllRead();
}
