package com.aqarcom.app.data.api;

import com.aqarcom.app.data.model.*;

import java.util.List;

import retrofit2.Call;
import retrofit2.http.*;

/** Contractor's own bids (FR-12, FR-13, FR-16). */
public interface BidApi {
    @GET("bids/mine")
    Call<ApiResponse<List<BidWithTender>>> mine(@Query("page") Integer page, @Query("limit") Integer limit,
                                                @Query("includeWithdrawn") Boolean includeWithdrawn);

    @PATCH("bids/{id}")
    Call<ApiResponse<Bid>> update(@Path("id") String id, @Body BidRequest body);

    @POST("bids/{id}/withdraw")
    Call<ApiResponse<Bid>> withdraw(@Path("id") String id);
}
