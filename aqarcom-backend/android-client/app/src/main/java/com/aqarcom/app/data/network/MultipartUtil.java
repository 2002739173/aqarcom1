package com.aqarcom.app.data.network;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

import okhttp3.MediaType;
import okhttp3.MultipartBody;
import okhttp3.RequestBody;

/** Builds multipart parts from a content Uri (gallery / camera / file picker). */
public final class MultipartUtil {
    private MultipartUtil() {}

    public static MultipartBody.Part part(Context ctx, String field, Uri uri, ProgressRequestBody.Listener listener) throws IOException {
        ContentResolver cr = ctx.getContentResolver();
        String mime = cr.getType(uri);
        if (mime == null) mime = "application/octet-stream";
        byte[] bytes = readAll(cr.openInputStream(uri));
        RequestBody body = RequestBody.create(bytes, MediaType.parse(mime));
        if (listener != null) body = new ProgressRequestBody(body, listener);
        return MultipartBody.Part.createFormData(field, displayName(ctx, uri), body);
    }

    public static RequestBody text(String value) {
        return RequestBody.create(value == null ? "" : value, MediaType.parse("text/plain"));
    }

    public static String displayName(Context ctx, Uri uri) {
        try (Cursor c = ctx.getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (i >= 0) return c.getString(i);
            }
        }
        return "file";
    }

    public static long size(Context ctx, Uri uri) {
        try (Cursor c = ctx.getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int i = c.getColumnIndex(OpenableColumns.SIZE);
                if (i >= 0) return c.getLong(i);
            }
        }
        return -1;
    }

    static byte[] readAll(InputStream in) throws IOException {
        if (in == null) throw new IOException("cannot open file");
        try (InputStream is = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[16 * 1024];
            int n;
            while ((n = is.read(buf)) != -1) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }
}
