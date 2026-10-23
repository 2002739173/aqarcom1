package com.aqarcom.app.data.network;

import com.aqarcom.app.data.model.ApiError;
import com.aqarcom.app.data.model.ApiResponse;
import com.aqarcom.app.data.model.PageMeta;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

/**
 * Convenience callback that unwraps the { success, data, meta } envelope.
 *
 *   ApiClient.properties().get(id).enqueue(new ApiCallback<Property>() {
 *       @Override public void onSuccess(Property p, PageMeta meta) { bind(p); }
 *       @Override public void onError(ApiError e) { toast(e.message); }
 *   });
 */
public abstract class ApiCallback<T> implements Callback<ApiResponse<T>> {

    public abstract void onSuccess(T data, PageMeta meta);

    public abstract void onError(ApiError error);

    @Override
    public void onResponse(Call<ApiResponse<T>> call, Response<ApiResponse<T>> response) {
        if (response.isSuccessful() && response.body() != null && response.body().success) {
            onSuccess(response.body().data, response.body().meta);
        } else {
            onError(ErrorParser.parse(response));
        }
    }

    @Override
    public void onFailure(Call<ApiResponse<T>> call, Throwable t) {
        if (!call.isCanceled()) onError(ErrorParser.fromThrowable(t));
    }
}
