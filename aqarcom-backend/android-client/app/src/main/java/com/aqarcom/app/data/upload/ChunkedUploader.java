package com.aqarcom.app.data.upload;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

import com.aqarcom.app.data.model.ApiError;
import com.aqarcom.app.data.model.ApiResponse;
import com.aqarcom.app.data.model.TenderDocument;
import com.aqarcom.app.data.model.UploadIdRequest;
import com.aqarcom.app.data.model.UploadInitRequest;
import com.aqarcom.app.data.model.UploadSession;
import com.aqarcom.app.data.network.ApiClient;
import com.aqarcom.app.data.network.ErrorParser;
import com.aqarcom.app.data.network.MultipartUtil;

import java.io.InputStream;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import okhttp3.MediaType;
import okhttp3.RequestBody;
import retrofit2.Response;

/**
 * Resumable upload of a spec book (NFR-01): splits the file into 1 MB chunks, uploads them,
 * and after a connection loss resumes from the chunks the server reports as missing.
 * The session id is remembered per (tenderId, file Uri) so a retry after an app restart also resumes.
 *
 *   new ChunkedUploader(ctx).upload(tenderId, uri, "تعديل البند 4", new ChunkedUploader.Listener() {
 *       public void onProgress(int percent) { progressBar.setProgress(percent); }
 *       public void onDone(TenderDocument d) { toast("تم رفع الإصدار " + d.version); }
 *       public void onError(ApiError e) { toast(e.message); }  // call upload(...) again to resume
 *   });
 */
public class ChunkedUploader {
    public static final int CHUNK_SIZE = 1024 * 1024;

    public interface Listener {
        void onProgress(int percent);
        void onDone(TenderDocument document);
        void onError(ApiError error);
    }

    private static final ExecutorService IO = Executors.newSingleThreadExecutor();
    private final Context ctx;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final SharedPreferences prefs;

    public ChunkedUploader(Context ctx) {
        this.ctx = ctx.getApplicationContext();
        this.prefs = this.ctx.getSharedPreferences("aqarcom_uploads", Context.MODE_PRIVATE);
    }

    public void upload(String tenderId, Uri uri, String note, Listener l) {
        IO.execute(() -> {
            try {
                String key = tenderId + "|" + uri;
                String mime = ctx.getContentResolver().getType(uri);
                long size = MultipartUtil.size(ctx, uri);
                String name = MultipartUtil.displayName(ctx, uri);

                UploadSession s = null;
                String savedId = prefs.getString(key, null);
                if (savedId != null) {
                    Response<ApiResponse<UploadSession>> st = ApiClient.uploads().status(savedId).execute();
                    if (st.isSuccessful() && st.body() != null) s = st.body().data;
                }
                if (s == null) {
                    Response<ApiResponse<UploadSession>> r = ApiClient.uploads()
                            .init(new UploadInitRequest(name, mime, size, CHUNK_SIZE)).execute();
                    if (!r.isSuccessful()) { fail(l, ErrorParser.parse(r)); return; }
                    s = r.body().data;
                    prefs.edit().putString(key, s.id).apply();
                }

                Set<Integer> missing = new HashSet<>(s.missingChunks);
                int done = s.totalChunks - missing.size();
                byte[] buf = new byte[CHUNK_SIZE];
                try (InputStream in = ctx.getContentResolver().openInputStream(uri)) {
                    for (int i = 0; i < s.totalChunks; i++) {
                        int len = readFully(in, buf);
                        if (!missing.contains(i)) continue;
                        byte[] chunk = java.util.Arrays.copyOf(buf, len);
                        RequestBody body = RequestBody.create(chunk, MediaType.parse("application/octet-stream"));
                        Response<ApiResponse<UploadSession>> r = ApiClient.uploads().putChunk(s.id, i, body).execute();
                        if (!r.isSuccessful()) { fail(l, ErrorParser.parse(r)); return; }
                        done++;
                        final int pct = (int) (done * 100L / s.totalChunks);
                        main.post(() -> l.onProgress(pct));
                    }
                }

                Response<ApiResponse<TenderDocument>> fin = ApiClient.tenders()
                        .attachUploadedDocument(tenderId, new UploadIdRequest(s.id, note)).execute();
                if (!fin.isSuccessful()) { fail(l, ErrorParser.parse(fin)); return; }
                prefs.edit().remove(key).apply();
                TenderDocument doc = fin.body().data;
                main.post(() -> l.onDone(doc));
            } catch (Exception e) {
                fail(l, ErrorParser.fromThrowable(e)); // network lost → call upload() again to resume
            }
        });
    }

    private void fail(Listener l, ApiError e) { main.post(() -> l.onError(e)); }

    private static int readFully(InputStream in, byte[] buf) throws java.io.IOException {
        int off = 0;
        while (off < buf.length) {
            int n = in.read(buf, off, buf.length - off);
            if (n == -1) break;
            off += n;
        }
        return off;
    }
}
