package com.aqarcom.app.data.network;

import com.aqarcom.app.data.model.ApiError;
import com.aqarcom.app.data.model.ApiResponse;

import java.io.IOException;

import okhttp3.ResponseBody;
import retrofit2.Response;

/**
 * Converts an unsuccessful Retrofit response into ApiError (code + Arabic message + details).
 *
 *   if (!response.isSuccessful()) {
 *       ApiError e = ErrorParser.parse(response);
 *       if ("CONTRACTOR_NOT_VERIFIED".equals(e.code)) openVerificationScreen();
 *       else showToast(e.message);
 *   }
 */
public final class ErrorParser {
    private ErrorParser() {}

    public static ApiError parse(Response<?> response) {
        ResponseBody body = response.errorBody();
        if (body != null) {
            try {
                ApiResponse<?> r = ApiClient.GSON.fromJson(body.charStream(), ApiResponse.class);
                if (r != null && r.error != null) {
                    r.error.httpStatus = response.code();
                    return r.error;
                }
            } catch (Exception ignored) {
            } finally {
                body.close();
            }
        }
        ApiError e = new ApiError();
        e.httpStatus = response.code();
        e.code = "HTTP_" + response.code();
        e.message = "تعذّر إتمام الطلب (" + response.code() + ")";
        return e;
    }

    public static ApiError fromThrowable(Throwable t) {
        ApiError e = new ApiError();
        e.code = t instanceof IOException ? "NETWORK_ERROR" : "UNKNOWN";
        e.message = t instanceof IOException ? "تحقق من اتصالك بالإنترنت" : "حدث خطأ غير متوقع";
        return e;
    }
}
