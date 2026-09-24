package com.passwordmanager.plugins.autofill;

import android.app.PendingIntent;
import android.app.assist.AssistStructure;
import android.app.slice.Slice;
import android.app.slice.SliceSpec;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.CancellationSignal;
import android.service.autofill.AutofillService;
import android.service.autofill.Dataset;
import android.service.autofill.FillCallback;
import android.service.autofill.FillContext;
import android.service.autofill.FillRequest;
import android.service.autofill.FillResponse;
import android.service.autofill.InlinePresentation;
import android.service.autofill.SaveCallback;
import android.service.autofill.SaveRequest;
import android.view.autofill.AutofillId;
import android.view.autofill.AutofillValue;
import android.view.inputmethod.InlineSuggestionsRequest;
import android.widget.RemoteViews;
import android.widget.inline.InlinePresentationSpec;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import androidx.annotation.RequiresApi;

/**
 * Android AutofillService implementation for SecureX.
 *
 * Scans the view hierarchy for username/email and password fields, matches them
 * against the unlocked in-memory vault, and presents matching credentials as
 * autofill suggestions (both dropdown RemoteViews and Android 11+ keyboard inline chips).
 *
 * If the vault is locked, returns an authentication prompt that brings up SecureX.
 */
@RequiresApi(api = Build.VERSION_CODES.O)
public class VaultAutofillService extends AutofillService {

    @Override
    public void onFillRequest(FillRequest request, CancellationSignal signal, FillCallback callback) {
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

        String vaultJson = VaultAutofillManager.vaultData;

        // 1. Vault is LOCKED: Present 1-tap unlock prompt instead of failing
        if (vaultJson == null) {
            try {
                FillResponse.Builder authResponseBuilder = new FillResponse.Builder();
                Intent unlockIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
                if (unlockIntent == null) {
                    unlockIntent = new Intent(Intent.ACTION_MAIN);
                    unlockIntent.setPackage(getPackageName());
                }
                unlockIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

                PendingIntent pi = PendingIntent.getActivity(
                        this,
                        1001,
                        unlockIntent,
                        PendingIntent.FLAG_CANCEL_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );

                RemoteViews authView = makePresentation("🔒 Unlock SecureX to autofill");
                AutofillId[] targetIds;
                if (finder.usernameId != null && finder.passwordId != null) {
                    targetIds = new AutofillId[]{finder.usernameId, finder.passwordId};
                } else if (finder.usernameId != null) {
                    targetIds = new AutofillId[]{finder.usernameId};
                } else {
                    targetIds = new AutofillId[]{finder.passwordId};
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    InlinePresentation inlineAuth = makeInlinePresentation(request, "🔒 Unlock SecureX");
                    if (inlineAuth != null) {
                        authResponseBuilder.setAuthentication(targetIds, pi.getIntentSender(), authView, inlineAuth);
                    } else {
                        authResponseBuilder.setAuthentication(targetIds, pi.getIntentSender(), authView);
                    }
                } else {
                    authResponseBuilder.setAuthentication(targetIds, pi.getIntentSender(), authView);
                }

                callback.onSuccess(authResponseBuilder.build());
            } catch (Exception e) {
                callback.onSuccess(null);
            }
            return;
        }

        // 2. Vault is UNLOCKED: Search matching credentials for current app/domain
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
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        InlinePresentation inlineUsername = makeInlinePresentation(request, username);
                        if (inlineUsername != null) {
                            datasetBuilder.setValue(finder.usernameId, AutofillValue.forText(username), usernameView, inlineUsername);
                        } else {
                            datasetBuilder.setValue(finder.usernameId, AutofillValue.forText(username), usernameView);
                        }
                    } else {
                        datasetBuilder.setValue(finder.usernameId, AutofillValue.forText(username), usernameView);
                    }
                }

                if (finder.passwordId != null && !password.isEmpty()) {
                    RemoteViews passwordView = makePresentation("Password for " + title);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        InlinePresentation inlinePassword = makeInlinePresentation(request, "•••••••• (" + title + ")");
                        if (inlinePassword != null) {
                            datasetBuilder.setValue(finder.passwordId, AutofillValue.forText(password), passwordView, inlinePassword);
                        } else {
                            datasetBuilder.setValue(finder.passwordId, AutofillValue.forText(password), passwordView);
                        }
                    } else {
                        datasetBuilder.setValue(finder.passwordId, AutofillValue.forText(password), passwordView);
                    }
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
        callback.onSuccess();
    }

    private RemoteViews makePresentation(String label) {
        RemoteViews views = new RemoteViews(getPackageName(), android.R.layout.simple_list_item_1);
        views.setCharSequence(android.R.id.text1, "setText", "🔐 " + label);
        return views;
    }

    private InlinePresentation makeInlinePresentation(FillRequest request, String text) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                InlineSuggestionsRequest inlineRequest = request.getInlineSuggestionsRequest();
                if (inlineRequest != null) {
                    List<InlinePresentationSpec> specs = inlineRequest.getInlinePresentationSpecs();
                    if (specs != null && !specs.isEmpty()) {
                        InlinePresentationSpec spec = specs.get(0);
                        Uri sliceUri = Uri.parse("content://com.passwordmanager.vault.autofill/inline/" + Math.abs(text.hashCode()));
                        Slice.Builder sliceBuilder = new Slice.Builder(sliceUri, new SliceSpec("InlineSuggestion", 1));
                        sliceBuilder.addText(text, null, Collections.emptyList());
                        return new InlinePresentation(sliceBuilder.build(), spec, false);
                    }
                }
            } catch (Throwable ignored) {
                // Graceful fallback to dropdown RemoteViews
            }
        }
        return null;
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
