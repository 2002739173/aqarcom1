package com.aqarcom.app.data.network;

import java.io.IOException;

import okhttp3.MediaType;
import okhttp3.RequestBody;
import okio.Buffer;
import okio.BufferedSink;
import okio.ForwardingSink;
import okio.Okio;
import okio.Sink;

/** Wraps a RequestBody to report upload progress (visible progress bar — SRS 3-1 / NFR-01). */
public class ProgressRequestBody extends RequestBody {
    public interface Listener { void onProgress(long bytesWritten, long totalBytes); }

    private final RequestBody delegate;
    private final Listener listener;

    public ProgressRequestBody(RequestBody delegate, Listener listener) {
        this.delegate = delegate;
        this.listener = listener;
    }

    @Override public MediaType contentType() { return delegate.contentType(); }

    @Override public long contentLength() throws IOException { return delegate.contentLength(); }

    @Override
    public void writeTo(BufferedSink sink) throws IOException {
        final long total = contentLength();
        Sink counting = new ForwardingSink(sink) {
            long written = 0;
            @Override public void write(Buffer source, long byteCount) throws IOException {
                super.write(source, byteCount);
                written += byteCount;
                listener.onProgress(written, total);
            }
        };
        BufferedSink buffered = Okio.buffer(counting);
        delegate.writeTo(buffered);
        buffered.flush();
    }
}
