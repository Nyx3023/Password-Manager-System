package com.passwordmanager.plugins.autofill;

import android.content.Context;
import android.content.Intent;
import android.provider.Settings;

/**
 * Manages the vault data shared between the Capacitor plugin and the AutofillService.
 * Uses a static in-memory store so the service can access credentials without
 * needing to decrypt them again.
 */
public class VaultAutofillManager {

    /** In-memory vault JSON (plaintext) shared with VaultAutofillService. */
    static volatile String vaultData = null;

    /**
     * Push unlocked vault data into memory for the AutofillService to use.
     */
    public void setVaultData(Context context, String data) {
        vaultData = data;
    }

    /**
     * Wipe all stored credentials (called on vault lock).
     */
    public void clearVaultData(Context context) {
        vaultData = null;
    }

    /**
     * Check if this app's AutofillService is the currently selected one.
     */
    public boolean isAutofillServiceEnabled(Context context) {
        String enabled = Settings.Secure.getString(
                context.getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        );
        String component = context.getPackageName() + "/.autofill.VaultAutofillService";
        if (enabled == null) return false;
        return enabled.toLowerCase().contains(component.toLowerCase());
    }

    /**
     * Open the system Autofill settings screen.
     */
    public void openAutofillSettings(Context context) {
        Intent intent = new Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }
}
