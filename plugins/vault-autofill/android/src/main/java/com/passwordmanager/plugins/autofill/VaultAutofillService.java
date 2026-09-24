package com.passwordmanager.plugins.autofill;

import android.app.assist.AssistStructure;
import android.os.Build;
import android.os.CancellationSignal;
import android.service.autofill.AutofillService;
import android.service.autofill.Dataset;
import android.service.autofill.FillCallback;
import android.service.autofill.FillContext;
import android.service.autofill.FillRequest;
import android.service.autofill.FillResponse;
import android.service.autofill.SaveCallback;
import android.service.autofill.SaveRequest;
import android.view.autofill.AutofillValue;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

import androidx.annotation.RequiresApi;

/**
 * Android AutofillService implementation.
 *
 * When another app requests autofill, Android calls onFillRequest(). We scan
 * the view hierarchy for username/email and password fields, match them against
 * the in-memory vault (set by VaultAutofillManager when the vault is unlocked),
 * and present matching credentials as autofill suggestions.
 *
 * FLAG_SECURE is not set here — it applies to the MainActivity window only.
 */
@RequiresApi(api = Build.VERSION_CODES.O)
public class VaultAutofillService extends AutofillService {

    @Override
    public void onFillRequest(FillRequest request, CancellationSignal signal, FillCallback callback) {
        String vaultJson = VaultAutofillManager.vaultData;
        if (vaultJson == null) {
            // Vault is locked — no suggestions.
            callback.onSuccess(null);
            return;
        }

        List<FillContext> contexts = request.getFillContexts();
        if (contexts.isEmpty()) {
            callback.onSuccess(null);
            return;
        }

        AssistStructure structure = contexts.get(contexts.size() - 1).getStructure();
        FieldFinder finder = new FieldFinder();
        finder.parseStructure(structure);

        if (finder.usernameId == null && finder.passwordId == null) {
            callback.onSuccess(null);
            return;
        }

        // Parse the current web URL from the structure to filter matching entries.
        String webDomain = structure.getActivityComponent().getPackageName();
        if (finder.webDomain != null) {
            webDomain = finder.webDomain;
        }

        List<JSONObject> matches = findMatches(vaultJson, webDomain);
        if (matches.isEmpty()) {
            callback.onSuccess(null);
            return;
        }

        FillResponse.Builder responseBuilder = new FillResponse.Builder();

        for (JSONObject entry : matches) {
            try {
                String username = entry.optString("username", "");
                String password = entry.optString("password", "");
                String title = entry.optString("title", username);

                Dataset.Builder datasetBuilder = new Dataset.Builder();

                if (finder.usernameId != null && !username.isEmpty()) {
                    RemoteViews usernameView = makePresentation(title + " (" + username + ")");
                    datasetBuilder.setValue(finder.usernameId, AutofillValue.forText(username), usernameView);
                }

                if (finder.passwordId != null && !password.isEmpty()) {
                    RemoteViews passwordView = makePresentation("Password for " + title);
                    datasetBuilder.setValue(finder.passwordId, AutofillValue.forText(password), passwordView);
                }

                responseBuilder.addDataset(datasetBuilder.build());
            } catch (Exception ignored) {}
        }

        try {
            callback.onSuccess(responseBuilder.build());
        } catch (Exception e) {
            callback.onSuccess(null);
        }
    }

    @Override
    public void onSaveRequest(SaveRequest request, SaveCallback callback) {
        // Save is not implemented — vault saves happen through the main app UI.
        callback.onSuccess();
    }

    private RemoteViews makePresentation(String label) {
        RemoteViews views = new RemoteViews(getPackageName(), android.R.layout.simple_list_item_1);
        views.setCharSequence(android.R.id.text1, "setText", "🔐 " + label);
        return views;
    }

    private List<JSONObject> findMatches(String vaultJson, String domain) {
        List<JSONObject> matches = new ArrayList<>();
        if (domain == null || domain.isEmpty()) return matches;
        try {
            JSONObject vault = new JSONObject(vaultJson);
            JSONArray entries = vault.optJSONArray("entries");
            if (entries == null) return matches;
            for (int i = 0; i < entries.length(); i++) {
                JSONObject entry = entries.optJSONObject(i);
                if (entry == null) continue;
                String url = entry.optString("url", "");
                if (url.contains(domain) || domain.contains(extractDomain(url))) {
                    matches.add(entry);
                }
            }
        } catch (Exception ignored) {}
        return matches;
    }

    private String extractDomain(String url) {
        try {
            url = url.replaceAll("https?://", "").replaceAll("www\\.", "");
            int slash = url.indexOf('/');
            return slash > 0 ? url.substring(0, slash) : url;
        } catch (Exception e) {
            return url;
        }
    }
}
