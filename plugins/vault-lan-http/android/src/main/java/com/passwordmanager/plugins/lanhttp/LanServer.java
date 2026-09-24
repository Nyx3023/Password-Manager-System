package com.passwordmanager.plugins.lanhttp;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.util.Log;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.UnknownHostException;
import java.nio.ByteOrder;

/**
 * Minimal HTTP server hosted on the phone for phone-as-server LAN sync mode.
 *
 * Endpoints:
 *  GET /api/status  — Returns server info
 *  GET /api/vault   — Returns current vault JSON
 *  PUT /api/vault   — Receives new vault JSON from PC
 *
 * Security: The phone's LAN server also requires the pairing token in requests
 * from the PC (validated the same way as the desktop server).
 */
public class LanServer {

    public interface VaultPushedListener {
        void onVaultPushed(String vaultData);
    }

    private static final String TAG = "LanServer";
    private static final int PORT = 9848; // Different from PC port 9847

    private final Context context;
    private final VaultPushedListener listener;
    private volatile String vaultData = null;
    private volatile String storedToken = null;
    private ServerSocket serverSocket = null;
    private Thread serverThread = null;
    private volatile boolean running = false;

    public LanServer(Context context, VaultPushedListener listener) {
        this.context = context;
        this.listener = listener;
    }

    public void setVaultData(String data) {
        this.vaultData = data;
    }

    public void setToken(String token) {
        this.storedToken = token;
    }

    public JSObject start() {
        if (running) return buildStatus(true);
        try {
            serverSocket = new ServerSocket(PORT);
            running = true;
            serverThread = new Thread(this::acceptLoop);
            serverThread.setDaemon(true);
            serverThread.start();
        } catch (IOException e) {
            Log.e(TAG, "Failed to start server: " + e.getMessage());
            return buildStatus(false);
        }
        return buildStatus(true);
    }

    public void stop() {
        running = false;
        try {
            if (serverSocket != null && !serverSocket.isClosed()) {
                serverSocket.close();
            }
        } catch (IOException ignored) {}
    }

    private void acceptLoop() {
        while (running) {
            try {
                Socket client = serverSocket.accept();
                new Thread(() -> handleClient(client)).start();
            } catch (IOException e) {
                if (running) Log.e(TAG, "Accept error: " + e.getMessage());
            }
        }
    }

    private void handleClient(Socket socket) {
        try (socket;
             BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), "UTF-8"));
             OutputStream out = socket.getOutputStream()) {

            // Read request line.
            String requestLine = reader.readLine();
            if (requestLine == null) return;

            String[] parts = requestLine.split(" ");
            if (parts.length < 2) return;
            String method = parts[0];
            String path = parts[1].split("\\?")[0];

            // Read headers.
            String authHeader = null;
            int contentLength = 0;
            String line;
            while ((line = reader.readLine()) != null && !line.isEmpty()) {
                if (line.toLowerCase().startsWith("authorization:")) {
                    authHeader = line.substring("authorization:".length()).trim();
                } else if (line.toLowerCase().startsWith("content-length:")) {
                    try { contentLength = Integer.parseInt(line.split(":")[1].trim()); } catch (Exception ignored) {}
                }
            }

            // Validate auth token.
            if (!isAuthorized(authHeader)) {
                writeResponse(out, 401, "application/json", "{\"error\":\"Unauthorized\"}");
                return;
            }

            if ("/api/status".equals(path) && "GET".equals(method)) {
                String ip = getLocalIp();
                writeResponse(out, 200, "application/json",
                        "{\"running\":true,\"port\":" + PORT + ",\"address\":\"" + ip + ":" + PORT + "\"}");
            } else if ("/api/vault".equals(path) && "GET".equals(method)) {
                if (vaultData == null) {
                    writeResponse(out, 404, "application/json", "{\"error\":\"No vault on phone.\"}");
                } else {
                    writeResponse(out, 200, "application/json", vaultData);
                }
            } else if ("/api/vault".equals(path) && "PUT".equals(method)) {
                char[] bodyBuf = new char[contentLength];
                int read = reader.read(bodyBuf, 0, contentLength);
                String body = new String(bodyBuf, 0, read);
                vaultData = body;
                if (listener != null) listener.onVaultPushed(body);
                writeResponse(out, 200, "application/json", "{\"ok\":true}");
            } else {
                writeResponse(out, 404, "application/json", "{\"error\":\"Not found\"}");
            }

        } catch (Exception e) {
            Log.e(TAG, "Client error: " + e.getMessage());
        }
    }

    private boolean isAuthorized(String authHeader) {
        if (storedToken == null) return false; // No token set — refuse all.
        if (authHeader == null || !authHeader.startsWith("Bearer ")) return false;
        String incoming = authHeader.substring("Bearer ".length()).trim();
        // Constant-time comparison.
        return constantTimeEquals(incoming, storedToken);
    }

    private boolean constantTimeEquals(String a, String b) {
        if (a.length() != b.length()) return false;
        int result = 0;
        for (int i = 0; i < a.length(); i++) {
            result |= a.charAt(i) ^ b.charAt(i);
        }
        return result == 0;
    }

    private void writeResponse(OutputStream out, int status, String contentType, String body) throws IOException {
        byte[] bodyBytes = body.getBytes("UTF-8");
        String headers = "HTTP/1.1 " + status + " OK\r\n"
                + "Content-Type: " + contentType + "\r\n"
                + "Content-Length: " + bodyBytes.length + "\r\n"
                + "Connection: close\r\n\r\n";
        out.write(headers.getBytes("UTF-8"));
        out.write(bodyBytes);
        out.flush();
    }

    private String getLocalIp() {
        try {
            WifiManager wm = (WifiManager) context.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            int ip = wm.getConnectionInfo().getIpAddress();
            if (ByteOrder.nativeOrder().equals(ByteOrder.LITTLE_ENDIAN)) {
                ip = Integer.reverseBytes(ip);
            }
            return InetAddress.getByAddress(new byte[]{
                (byte)(ip >> 24), (byte)(ip >> 16), (byte)(ip >> 8), (byte)ip
            }).getHostAddress();
        } catch (UnknownHostException e) {
            return "unknown";
        }
    }

    private JSObject buildStatus(boolean running) {
        JSObject st = new JSObject();
        st.put("running", running);
        st.put("port", PORT);
        st.put("address", getLocalIp() + ":" + PORT);
        return st;
    }
}
