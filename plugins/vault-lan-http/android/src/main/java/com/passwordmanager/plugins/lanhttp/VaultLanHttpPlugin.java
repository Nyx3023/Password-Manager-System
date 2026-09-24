package com.passwordmanager.plugins.lanhttp;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * VaultLanHttpPlugin — Capacitor bridge for LAN sync on Android.
 *
 * Provides:
 *  - HTTP request (bypasses browser CORS restrictions, sends Authorization headers)
 *  - UDP discovery listener (receives PC broadcasts during pairing)
 *  - Phone-hosted HTTP server (allows PC to push vault to phone)
 */
@CapacitorPlugin(name = "VaultLanHttp")
public class VaultLanHttpPlugin extends Plugin {

    private final LanHttpClient httpClient = new LanHttpClient();
    private LanDiscovery discovery = null;
    private LanServer server = null;

    // ── HTTP Client ──────────────────────────────────────────────────────────

    /**
     * Perform an HTTP request and return status, headers, and body text.
     * This runs on a background thread to avoid blocking the UI.
     */
    @PluginMethod
    public void request(PluginCall call) {
        String url = call.getString("url");
        String method = call.getString("method", "GET");
        JSObject headersObj = call.getObject("headers", new JSObject());
        String body = call.getString("body", null);

        if (url == null) {
            call.reject("Missing 'url' parameter.");
            return;
        }



        new Thread(() -> {
            try {
                LanHttpClient.HttpResult result = httpClient.execute(url, method, headersObj, body);
                JSObject ret = new JSObject();
                ret.put("status", result.status);
                ret.put("data", result.body);
                JSObject headers = new JSObject();
                for (String key : result.headers.keySet()) {
                    headers.put(key, result.headers.get(key));
                }
                ret.put("headers", headers);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("HTTP request failed: " + e.getMessage());
            }
        }).start();
    }

    // ── UDP Discovery (Phone listening for PC beacon) ────────────────────────

    /**
     * Start listening on UDP port 9846 for PC discovery beacons.
     * When a beacon is received, fires a "pcDiscovered" event.
     */
    @PluginMethod
    public void startDiscovery(PluginCall call) {
        stopDiscoveryInternal();
        discovery = new LanDiscovery(getContext(), (ip, port, code) -> {
            JSObject data = new JSObject();
            data.put("ip", ip);
            data.put("port", port);
            if (code != null) data.put("code", code);
            notifyListeners("pcDiscovered", data);
        });
        discovery.start();
        call.resolve();
    }

    @PluginMethod
    public void stopDiscovery(PluginCall call) {
        stopDiscoveryInternal();
        call.resolve();
    }

    private void stopDiscoveryInternal() {
        if (discovery != null) {
            discovery.stop();
            discovery = null;
        }
    }

    // ── Phone-hosted LAN Server (for PC-initiated push) ──────────────────────

    /**
     * Start an HTTP server on the phone so the PC can push the vault to it.
     */
    @PluginMethod
    public void startServer(PluginCall call) {
        if (server == null) {
            server = new LanServer(getContext(), vaultData -> {
                JSObject data = new JSObject();
                data.put("vaultData", vaultData);
                notifyListeners("vaultPushed", data);
            });
        }
        JSObject result = server.start();
        call.resolve(result);
    }

    @PluginMethod
    public void stopServer(PluginCall call) {
        if (server != null) {
            server.stop();
            server = null;
        }
        call.resolve();
    }

    /**
     * Update the vault data served by the phone-hosted server.
     */
    @PluginMethod
    public void setServerVault(PluginCall call) {
        String vaultData = call.getString("vaultData");
        if (vaultData == null) {
            call.reject("Missing 'vaultData' parameter.");
            return;
        }
        if (server != null) {
            server.setVaultData(vaultData);
        }
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        stopDiscoveryInternal();
        if (server != null) {
            server.stop();
            server = null;
        }
    }
}
