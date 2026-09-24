package com.passwordmanager.plugins.autofill;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * VaultAutofillPlugin — Capacitor bridge for the Android AutofillService.
 *
 * The actual autofill work is done by VaultAutofillService (a separate
 * AutofillService component registered in the manifest). This plugin
 * lets the JS layer push the unlocked vault credentials into the service
 * so it can supply them to other apps on demand.
 */
@CapacitorPlugin(name = "VaultAutofill")
public class VaultAutofillPlugin extends Plugin {

    private final VaultAutofillManager manager = new VaultAutofillManager();

    /**
     * Called from JS when the vault is unlocked.
     * Stores credentials in the service so autofill can respond to requests.
     */
    @PluginMethod
    public void setVaultData(PluginCall call) {
        String data = call.getString("data");
        if (data == null) {
            call.reject("Missing 'data' parameter.");
            return;
        }
        manager.setVaultData(getContext(), data);
        call.resolve();
    }

    /**
     * Called from JS when the vault is locked or session cleared.
     */
    @PluginMethod
    public void clearVaultData(PluginCall call) {
        manager.clearVaultData(getContext());
        call.resolve();
    }

    @PluginMethod
    public void clearSession(PluginCall call) {
        manager.clearVaultData(getContext());
        call.resolve();
    }

    @PluginMethod
    public void syncCredentials(PluginCall call) {
        com.getcapacitor.JSArray creds = call.getArray("credentials");
        if (creds != null) {
            org.json.JSONObject obj = new org.json.JSONObject();
            try {
                obj.put("entries", creds);
                manager.setVaultData(getContext(), obj.toString());
            } catch (Exception ignored) {}
        }
        call.resolve();
    }

    @PluginMethod
    public void setSessionActive(PluginCall call) {
        Boolean active = call.getBoolean("active", true);
        if (!Boolean.TRUE.equals(active)) {
            manager.clearVaultData(getContext());
        }
        call.resolve();
    }

    @PluginMethod
    public void notifyUnlocked(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void isEnabled(PluginCall call) {
        boolean enabled = manager.isAutofillServiceEnabled(getContext());
        com.getcapacitor.JSObject ret = new com.getcapacitor.JSObject();
        ret.put("enabled", enabled);
        call.resolve(ret);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        manager.openAutofillSettings(getContext());
        call.resolve();
    }

    @PluginMethod
    public void getPendingAuthentication(PluginCall call) {
        com.getcapacitor.JSObject ret = new com.getcapacitor.JSObject();
        ret.put("pending", false);
        call.resolve(ret);
    }
}
