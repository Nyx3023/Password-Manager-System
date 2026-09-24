package com.passwordmanager.plugins.autofill;

import android.app.assist.AssistStructure;
import android.os.Build;
import android.view.View;
import android.view.autofill.AutofillId;

import androidx.annotation.RequiresApi;

/**
 * Walks the AssistStructure view hierarchy to find username/password fields.
 */
@RequiresApi(api = Build.VERSION_CODES.O)
public class FieldFinder {

    AutofillId usernameId = null;
    AutofillId passwordId = null;
    String webDomain = null;

    public void parseStructure(AssistStructure structure) {
        int nodes = structure.getWindowNodeCount();
        for (int i = 0; i < nodes; i++) {
            AssistStructure.WindowNode node = structure.getWindowNodeAt(i);
            parseNode(node.getRootViewNode());
        }
    }

    private void parseNode(AssistStructure.ViewNode node) {
        if (node == null) return;
        
        if (node.getWebDomain() != null && webDomain == null) {
            webDomain = node.getWebDomain();
        }

        String hint = node.getHint() != null ? node.getHint().toLowerCase() : "";
        String inputType = node.getInputType() != 0 ? String.valueOf(node.getInputType()) : "";
        String autofillHints = "";
        if (node.getAutofillHints() != null) {
            autofillHints = String.join(",", node.getAutofillHints()).toLowerCase();
        }
        String idEntry = node.getIdEntry() != null ? node.getIdEntry().toLowerCase() : "";

        boolean isPassword = autofillHints.contains(View.AUTOFILL_HINT_PASSWORD)
                || hint.contains("password") || hint.contains("passwd")
                || idEntry.contains("password") || idEntry.contains("passwd")
                // InputType: TYPE_TEXT_VARIATION_PASSWORD = 0x81, VISIBLE_PASSWORD = 0x91
                || inputType.equals("129") || inputType.equals("145");

        boolean isUsername = autofillHints.contains(View.AUTOFILL_HINT_USERNAME)
                || autofillHints.contains(View.AUTOFILL_HINT_EMAIL_ADDRESS)
                || hint.contains("user") || hint.contains("email") || hint.contains("login")
                || idEntry.contains("user") || idEntry.contains("email") || idEntry.contains("login");

        AutofillId id = node.getAutofillId();
        if (id != null) {
            if (isPassword && passwordId == null) {
                passwordId = id;
            } else if (isUsername && usernameId == null) {
                usernameId = id;
            }
        }

        for (int i = 0; i < node.getChildCount(); i++) {
            parseNode(node.getChildAt(i));
        }
    }
}
