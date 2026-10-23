package com.aqarcom.app.data.api;

import com.aqarcom.app.data.model.*;

import java.util.List;
import java.util.Map;

import okhttp3.MultipartBody;
import retrofit2.Call;
import retrofit2.http.*;

/** FR-05 → FR-09, FR-25 */
public interface PropertyApi {

    /**
     * Search (FR-08). Build the filters map with only the keys you need:
     * q, city, district, propertyType, purpose, currency, minPrice, maxPrice, minArea, maxArea,
     * minRooms, maxRooms, sort (newest | price_asc | price_desc | nearest), latitude, longitude, radiusKm, page, limit
     */
    @GET("properties")
    Call<ApiResponse<List<Property>>> search(@QueryMap Map<String, String> filters);

    /** Map pins for the visible region (FR-07): pass GoogleMap.getProjection().getVisibleRegion().latLngBounds */
    @GET("properties/map")
    Call<ApiResponse<List<MapPin>>> mapPins(@Query("swLat") double swLat, @Query("swLng") double swLng,
                                            @Query("neLat") double neLat, @Query("neLng") double neLng,
                                            @QueryMap Map<String, String> filters);

    @GET("properties/{id}")
    Call<ApiResponse<Property>> get(@Path("id") String id);

    @GET("properties/mine")
    Call<ApiResponse<List<Property>>> mine(@Query("page") Integer page, @Query("limit") Integer limit, @Query("status") String status);

    @POST("properties")
    Call<ApiResponse<Property>> create(@Body PropertyRequest body);

    @PATCH("properties/{id}")
    Call<ApiResponse<Property>> update(@Path("id") String id, @Body PropertyRequest body);

    @DELETE("properties/{id}")
    Call<ApiResponse<MessageResult>> delete(@Path("id") String id);

    /** Field name "images" — build parts with MultipartUtil.part(ctx, "images", uri, listener). */
    @Multipart
    @POST("properties/{id}/images")
    Call<ApiResponse<Property>> uploadImages(@Path("id") String id, @Part List<MultipartBody.Part> images);

    @DELETE("properties/{id}/images/{imageId}")
    Call<ApiResponse<Property>> deleteImage(@Path("id") String id, @Path("imageId") String imageId);

    /** FR-25 — signed-in users only (401 for visitors). */
    @GET("properties/{id}/contact")
    Call<ApiResponse<ContactInfo>> contact(@Path("id") String id);

    @GET("properties/favorites")
    Call<ApiResponse<List<Property>>> favorites(@Query("page") Integer page, @Query("limit") Integer limit);

    @POST("properties/{id}/favorite")
    Call<ApiResponse<MessageResult>> addFavorite(@Path("id") String id);

    @DELETE("properties/{id}/favorite")
    Call<ApiResponse<MessageResult>> removeFavorite(@Path("id") String id);
}
