package com.aqarcom.app.data.api;

import com.aqarcom.app.data.model.*;

import okhttp3.RequestBody;
import retrofit2.Call;
import retrofit2.http.*;

/** Resumable chunked upload (NFR-01). Use through upload.ChunkedUploader. */
public interface UploadApi {
    @POST("uploads")
    Call<ApiResponse<UploadSession>> init(@Body UploadInitRequest body);

    @GET("uploads/{id}")
    Call<ApiResponse<UploadSession>> status(@Path("id") String id);

    /** body = RequestBody.create(bytes, MediaType.parse("application/octet-stream")) */
    @PUT("uploads/{id}/chunks/{index}")
    Call<ApiResponse<UploadSession>> putChunk(@Path("id") String id, @Path("index") int index, @Body RequestBody chunk);
}
