package com.passwordmanager.plugins.lanhttp;

import android.content.Context;
import android.util.Log;

import org.json.JSONObject;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;

/**
 * Listens on UDP port 9846 for PC discovery beacons.
 *
 * When a beacon is received it parses the JSON payload:
 *   {"type":"pms-discovery","port":9847,"code":"ABC123"}
 *
 * The "code" field is included only when the PC is in pairing mode —
 * the phone can auto-fill it into the pairing input field.
 */
public class LanDiscovery {

    public interface DiscoveryListener {
        void onPcDiscovered(String ip, int port, String pairingCode);
    }

    private static final String TAG = "LanDiscovery";
    private static final int UDP_PORT = 9846;
    private static final int TIMEOUT_MS = 5000;

    private final Context context;
    private final DiscoveryListener listener;
    private volatile boolean running = false;
    private Thread thread = null;

    public LanDiscovery(Context context, DiscoveryListener listener) {
        this.context = context;
        this.listener = listener;
    }

    public void start() {
        if (running) return;
        running = true;
        thread = new Thread(this::listen);
        thread.setDaemon(true);
        thread.start();
    }

    public void stop() {
        running = false;
        if (thread != null) {
            thread.interrupt();
            thread = null;
        }
    }

    private void listen() {
        try (DatagramSocket socket = new DatagramSocket(UDP_PORT)) {
            socket.setSoTimeout(TIMEOUT_MS);
            byte[] buf = new byte[512];

            while (running) {
                try {
                    DatagramPacket packet = new DatagramPacket(buf, buf.length);
                    socket.receive(packet);

                    String data = new String(packet.getData(), 0, packet.getLength(), "UTF-8");
                    String senderIp = packet.getAddress().getHostAddress();

                    try {
                        JSONObject json = new JSONObject(data);
                        if (!"pms-discovery".equals(json.optString("type"))) continue;

                        int port = json.optInt("port", 9847);
                        // "code" is only present during pairing mode.
                        String code = json.has("code") ? json.getString("code") : null;

                        listener.onPcDiscovered(senderIp, port, code);
                    } catch (Exception e) {
                        Log.w(TAG, "Bad UDP packet: " + e.getMessage());
                    }
                } catch (java.net.SocketTimeoutException ignored) {
                    // Normal — loop back and check `running`.
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "UDP discovery error: " + e.getMessage());
        }
    }
}
