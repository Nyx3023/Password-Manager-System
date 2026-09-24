package com.passwordmanager.plugins.lanhttp;

import com.getcapacitor.JSObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Synchronous HTTP client that runs on a background thread.
 * Supports GET and PUT/POST with body and custom headers.
 * Used for authenticated LAN sync requests to the desktop.
 */
public class LanHttpClient {

    public static class HttpResult {
        public final int status;
        public final String body;
        public final Map<String, String> headers;

        public HttpResult(int status, String body, Map<String, String> headers) {
            this.status = status;
            this.body = body;
            this.headers = headers;
        }
    }

    private static final int CONNECT_TIMEOUT_MS = 5000;
    private static final int READ_TIMEOUT_MS = 15000;

    /**
     * Execute an HTTP request. Must be called from a background thread.
     */
    public HttpResult execute(String urlStr, String method, com.getcapacitor.JSObject headersObj, String body) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
        conn.setReadTimeout(READ_TIMEOUT_MS);
        conn.setRequestMethod(method.toUpperCase());

        // Set headers from the JSObject.
        if (headersObj != null) {
            for (java.util.Iterator<String> it = headersObj.keys(); it.hasNext(); ) {
                String key = it.next();
                String value = headersObj.optString(key, "");
                conn.setRequestProperty(key, value);
            }
        }

        // Write body for POST/PUT.
        if (body != null && !method.equalsIgnoreCase("GET")) {
            conn.setDoOutput(true);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.getBytes("UTF-8"));
            }
        }

        int status = conn.getResponseCode();

        // Read response body.
        StringBuilder sb = new StringBuilder();
        java.io.InputStream stream = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
        if (stream != null) {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, "UTF-8"))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line).append("\n");
                }
            }
        }

        // Collect response headers.
        Map<String, String> responseHeaders = new HashMap<>();
        Map<String, List<String>> headerFields = conn.getHeaderFields();
        if (headerFields != null) {
            for (Map.Entry<String, List<String>> entry : headerFields.entrySet()) {
                if (entry.getKey() != null && !entry.getValue().isEmpty()) {
                    responseHeaders.put(entry.getKey().toLowerCase(), entry.getValue().get(0));
                }
            }
        }

        conn.disconnect();
        return new HttpResult(status, sb.toString().trim(), responseHeaders);
    }
}
