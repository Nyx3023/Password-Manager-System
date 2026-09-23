import { useState } from "react";
import { Modal } from "../Modal";
import { LoadingIndicator } from "../LoadingIndicator";
import {
  buildGoogleAuthUrl,
  exchangeGoogleAuthCode,
  fetchGoogleUserProfile,
  generateCodeChallenge,
  generateCodeVerifier,
} from "@/shared/googleDrive";
import {
  fetchRemoteVaultForImport,
  saveCloudConfig,
} from "@/shared/cloudSync";
import {
  BUILTIN_GOOGLE_CLIENT_ID,
  BUILTIN_GOOGLE_CLIENT_SECRET,
} from "@/shared/googleDriveConfig";

interface GoogleDriveRestoreModalProps {
  open: boolean;
  onClose: () => void;
  onVaultDownloaded: (vaultJson: string, userEmail: string) => void;
}

export function GoogleDriveRestoreModal({
  open,
  onClose,
  onVaultDownloaded,
}: GoogleDriveRestoreModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualCodeOpen, setManualCodeOpen] = useState(false);
  const [manualAuthCode, setManualAuthCode] = useState("");
  const [pendingVerifier, setPendingVerifier] = useState<string | null>(null);
  const [pendingRedirectUri, setPendingRedirectUri] = useState<string | null>(null);

  const activeClientId = BUILTIN_GOOGLE_CLIENT_ID.trim();
  const activeClientSecret = BUILTIN_GOOGLE_CLIENT_SECRET.trim();

  const handleSignIn = async () => {
    if (!activeClientId) {
      setError("Missing Google OAuth credentials. Please configure .env.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier);

      if (window.electronAPI?.googleStartAuth) {
        // Desktop Electron loopback flow
        const authUrlTemplate = buildGoogleAuthUrl({
          clientId: activeClientId,
          redirectUri: "__REDIRECT_URI__",
          codeChallenge: challenge,
        });

        const authResult = await window.electronAPI.googleStartAuth(authUrlTemplate);
        if (!authResult.ok || !authResult.code) {
          throw new Error("Authentication was cancelled or failed.");
        }

        const tokens = await exchangeGoogleAuthCode({
          clientId: activeClientId,
          clientSecret: activeClientSecret || undefined,
          code: authResult.code,
          codeVerifier: verifier,
          redirectUri: authResult.redirectUri,
        });

        const profile = await fetchGoogleUserProfile(tokens.accessToken);

        const savedConfig = await saveCloudConfig({
          enabled: true,
          clientId: activeClientId,
          clientSecret: activeClientSecret || undefined,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: Date.now() + (tokens.expiresIn || 3600) * 1000,
          userEmail: profile.email,
          userName: profile.name,
          userPicture: profile.picture,
          lastSyncStatus: "idle",
          lastError: null,
        });

        // Search and download existing vault
        const remoteRaw = await fetchRemoteVaultForImport(savedConfig);
        if (!remoteRaw) {
          throw new Error(
            `Connected as ${profile.email}, but no vault file was found in your Google Drive.`
          );
        }

        onVaultDownloaded(remoteRaw, profile.email);
        onClose();
      } else {
        // Mobile / Browser flow
        const redirectUri = "http://127.0.0.1:9847/oauth2callback";

        const authUrl = buildGoogleAuthUrl({
          clientId: activeClientId,
          redirectUri,
          codeChallenge: challenge,
        });

        setPendingVerifier(verifier);
        setPendingRedirectUri(redirectUri);
        try {
          sessionStorage.setItem("securex_oauth_verifier", verifier);
          sessionStorage.setItem("securex_oauth_redirect_uri", redirectUri);
        } catch {}
        setManualCodeOpen(true);

        try {
          window.open(authUrl, "_system") || window.open(authUrl, "_blank");
        } catch {
          window.open(authUrl, "_blank");
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sign-in failed";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleCompleteManualCode = async () => {
    if (!manualAuthCode.trim()) return;
    setBusy(true);
    setError(null);

    try {
      let code = manualAuthCode.trim();
      let redirectUri =
        pendingRedirectUri ||
        sessionStorage.getItem("securex_oauth_redirect_uri") ||
        "http://127.0.0.1:9847/oauth2callback";

      if (code.includes("code=")) {
        try {
          const parsedUrl = new URL(code);
          code = parsedUrl.searchParams.get("code") || code;
          if (parsedUrl.origin.includes("127.0.0.1") || parsedUrl.origin.includes("localhost")) {
            redirectUri = `${parsedUrl.origin}${parsedUrl.pathname}`;
          }
        } catch {
          const match = code.match(/[?&]code=([^&]+)/);
          if (match) code = decodeURIComponent(match[1]);
        }
      }

      const verifier =
        pendingVerifier ||
        sessionStorage.getItem("securex_oauth_verifier") ||
        "";

      if (!verifier) {
        throw new Error("Authorization session expired. Please tap 'Sign in with Google' again.");
      }

      const tokens = await exchangeGoogleAuthCode({
        clientId: activeClientId,
        clientSecret: activeClientSecret || undefined,
        code,
        codeVerifier: verifier,
        redirectUri,
      });

      const profile = await fetchGoogleUserProfile(tokens.accessToken);

      const savedConfig = await saveCloudConfig({
        enabled: true,
        clientId: activeClientId,
        clientSecret: activeClientSecret || undefined,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: Date.now() + (tokens.expiresIn || 3600) * 1000,
        userEmail: profile.email,
        userName: profile.name,
        userPicture: profile.picture,
        lastSyncStatus: "idle",
        lastError: null,
      });

      const remoteRaw = await fetchRemoteVaultForImport(savedConfig);
      if (!remoteRaw) {
        throw new Error(
          `Connected as ${profile.email}, but no vault file was found in your Google Drive.`
        );
      }

      setManualCodeOpen(false);
      setManualAuthCode("");
      onVaultDownloaded(remoteRaw, profile.email);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Code exchange failed";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title="Restore from Google Drive" onClose={onClose}>
      <div className="stack" style={{ gap: "1rem" }}>
        <p className="muted small" style={{ margin: 0, lineHeight: 1.5 }}>
          Sign in with your Google account to automatically locate and restore your encrypted SecureX
          vault from Google Drive.
        </p>

        {error && (
          <div
            style={{
              padding: "0.75rem",
              borderRadius: "6px",
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#f87171",
              fontSize: "0.85rem",
            }}
          >
            {error}
          </div>
        )}

        <button
          type="button"
          className="primary block"
          onClick={handleSignIn}
          disabled={busy}
          style={{
            padding: "0.75rem 1rem",
            fontSize: "1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.75rem",
          }}
        >
          {busy ? (
            <LoadingIndicator variant="compact" label="Connecting..." />
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
              <span>Sign in with Google</span>
            </>
          )}
        </button>

        {manualCodeOpen && (
          <div
            style={{
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              padding: "0.85rem",
              marginTop: "0.5rem",
            }}
          >
            <div style={{ fontWeight: 500, fontSize: "0.9rem", marginBottom: "0.5rem" }}>
              Complete Authorization:
            </div>
            <p className="muted small" style={{ marginBottom: "0.5rem" }}>
              After approving access in the Google sign-in window, paste the authorization code
              or full callback URL here:
            </p>
            <input
              type="text"
              placeholder="Paste code or URL (e.g. 4/0A...)"
              value={manualAuthCode}
              onChange={(e) => setManualAuthCode(e.target.value)}
              style={{ width: "100%", marginBottom: "0.5rem" }}
            />
            <button
              type="button"
              className="primary small block"
              onClick={handleCompleteManualCode}
              disabled={busy || !manualAuthCode.trim()}
            >
              Verify and Download Vault
            </button>
          </div>
        )}

        <button type="button" className="ghost block" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
