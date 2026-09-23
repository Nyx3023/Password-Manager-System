import { useCallback, useEffect, useState } from "react";
import { Modal } from "./Modal";
import { LoadingIndicator } from "./LoadingIndicator";
import { formatLastSync } from "@/shared/syncTime";
import {
  buildGoogleAuthUrl,
  exchangeGoogleAuthCode,
  fetchGoogleUserProfile,
  generateCodeChallenge,
  generateCodeVerifier,
} from "@/shared/googleDrive";
import {
  disconnectCloudSync,
  loadCloudConfig,
  saveCloudConfig,
  syncVaultWithGoogleDrive,
  type GoogleDriveConfig,
  type VaultSyncTarget,
} from "@/shared/cloudSync";
import {
  BUILTIN_GOOGLE_CLIENT_ID,
  BUILTIN_GOOGLE_CLIENT_SECRET,
} from "@/shared/googleDriveConfig";

interface GoogleDriveSyncModalProps {
  open: boolean;
  vaultTarget: VaultSyncTarget;
  onClose: () => void;
  onMessage: (message: string) => void;
}

export function GoogleDriveSyncModal({
  open,
  vaultTarget,
  onClose,
  onMessage,
}: GoogleDriveSyncModalProps) {
  const [config, setConfig] = useState<GoogleDriveConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customClientId, setCustomClientId] = useState("");
  const [customClientSecret, setCustomClientSecret] = useState("");
  const [manualAuthCode, setManualAuthCode] = useState("");
  const [manualCodeOpen, setManualCodeOpen] = useState(false);
  const [pendingVerifier, setPendingVerifier] = useState<string | null>(null);
  const [pendingRedirectUri, setPendingRedirectUri] = useState<string | null>(null);

  const hasBuiltin = Boolean(BUILTIN_GOOGLE_CLIENT_ID.trim());
  const activeClientId = customClientId.trim() || BUILTIN_GOOGLE_CLIENT_ID.trim();
  const activeClientSecret = customClientSecret.trim() || BUILTIN_GOOGLE_CLIENT_SECRET.trim();

  const reloadConfig = useCallback(async () => {
    const cfg = await loadCloudConfig();
    setConfig(cfg);
    if (cfg.clientId && cfg.clientId !== BUILTIN_GOOGLE_CLIENT_ID) {
      setCustomClientId(cfg.clientId);
    }
    if (cfg.clientSecret) {
      setCustomClientSecret(cfg.clientSecret);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void reloadConfig();
      setError(null);
    }
  }, [open, reloadConfig]);

  // 1. Sign in flow
  const handleSignIn = async () => {
    if (!activeClientId) {
      setError("Please configure your Google OAuth Client ID before signing in.");
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

        await saveCloudConfig({
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

        await reloadConfig();
        onMessage(`Connected as ${profile.email}`);
      } else {
        // Mobile / Browser flow
        // Google Desktop App client IDs strictly accept http://127.0.0.1 loopback
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

  // 2. Complete manual code entry (fallback / mobile)
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

      // If user pasted full callback URL from browser address bar
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

      await saveCloudConfig({
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

      setManualCodeOpen(false);
      setManualAuthCode("");
      await reloadConfig();
      onMessage(`Connected as ${profile.email}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Code exchange failed";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  // 3. Trigger manual sync
  const handleSyncNow = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await syncVaultWithGoogleDrive(vaultTarget);
      if (result.ok) {
        onMessage(result.message);
      } else {
        setError(result.message);
      }
      await reloadConfig();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sync failed";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  // 4. Toggle auto sync
  const handleToggleAutoSync = async () => {
    if (!config) return;
    const next = !config.autoSync;
    await saveCloudConfig({ autoSync: next });
    await reloadConfig();
  };

  // 5. Disconnect
  const handleDisconnect = async () => {
    if (window.confirm("Are you sure you want to disconnect Google Drive? Your cloud copy will remain intact.")) {
      setBusy(true);
      await disconnectCloudSync();
      await reloadConfig();
      setBusy(false);
      onMessage("Google Drive disconnected.");
    }
  };

  const isConnected = !!config?.enabled && !!config?.refreshToken;

  return (
    <Modal title="Google Drive Cloud Sync" open={open} onClose={onClose}>
      <div className="stack" style={{ gap: "1rem" }}>
        {/* Header summary banner */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "1rem",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          <div
            style={{
              fontSize: "2rem",
              width: "48px",
              height: "48px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(66, 133, 244, 0.1)",
              borderRadius: "50%",
            }}
          >
            ☁️
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontWeight: 600, fontSize: "1rem" }}>Google Drive</span>
              <span
                className={`tag ${isConnected ? "tag--success" : "tag--neutral"}`}
                style={{
                  fontSize: "0.75rem",
                  padding: "0.15rem 0.5rem",
                  borderRadius: "4px",
                  background: isConnected ? "rgba(46, 160, 67, 0.15)" : "rgba(255, 255, 255, 0.1)",
                  color: isConnected ? "var(--success, #3fb950)" : "var(--muted)",
                }}
              >
                {isConnected ? "Connected" : "Not Linked"}
              </span>
            </div>
            <p className="muted small" style={{ margin: "0.25rem 0 0 0" }}>
              Zero-Knowledge AES-256 encrypted sync via private Google Drive AppData.
            </p>
          </div>
        </div>

        {/* Error message alert */}
        {error && (
          <div
            className="card"
            style={{
              borderColor: "var(--danger, #f85149)",
              background: "rgba(248, 81, 73, 0.1)",
              color: "var(--danger, #f85149)",
              padding: "0.75rem",
              fontSize: "0.875rem",
            }}
          >
            <strong>Error: </strong> {error}
          </div>
        )}

        {/* Connected state view */}
        {isConnected ? (
          <div className="stack" style={{ gap: "0.85rem" }}>
            {/* User Account Info */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.75rem 1rem",
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                {config?.userPicture ? (
                  <img
                    src={config.userPicture}
                    alt={config.userName || "Google User"}
                    style={{ width: "36px", height: "36px", borderRadius: "50%" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      background: "var(--accent)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontWeight: 600,
                    }}
                  >
                    {config?.userName?.[0] || config?.userEmail?.[0] || "G"}
                  </div>
                )}
                <div>
                  <div style={{ fontWeight: 500, fontSize: "0.95rem" }}>
                    {config?.userName || "Google User"}
                  </div>
                  <div className="muted small">{config?.userEmail}</div>
                </div>
              </div>

              <button
                type="button"
                className="ghost small"
                onClick={handleDisconnect}
                disabled={busy}
                style={{ color: "var(--danger, #f85149)" }}
              >
                Disconnect
              </button>
            </div>

            {/* Sync Status Details */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.75rem 1rem",
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                fontSize: "0.875rem",
              }}
            >
              <div>
                <span className="muted">Last synchronized: </span>
                <span>{formatLastSync(config?.lastSyncAt ?? null)}</span>
              </div>
              {config?.lastSyncStatus === "syncing" && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <LoadingIndicator variant="compact" label="Syncing..." />
                </div>
              )}
            </div>

            {/* Auto-sync Switch */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.75rem 1rem",
                border: "1px solid var(--border)",
                borderRadius: "8px",
              }}
            >
              <div>
                <div style={{ fontWeight: 500, fontSize: "0.9rem" }}>Automatic Sync</div>
                <div className="muted small">Sync changes automatically on save</div>
              </div>
              <button
                type="button"
                className={`toggle${config?.autoSync ? " on" : ""}`}
                aria-pressed={config?.autoSync}
                onClick={handleToggleAutoSync}
              />
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
              <button
                type="button"
                className="primary block"
                onClick={handleSyncNow}
                disabled={busy}
                style={{ flex: 1 }}
              >
                {busy ? <LoadingIndicator variant="compact" label="Syncing..." /> : "🔄 Sync Now"}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={onClose}
                disabled={busy}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Disconnected state view */
          <div className="stack" style={{ gap: "1rem" }}>
            <p className="muted small" style={{ lineHeight: 1.5 }}>
              Connect your Google account to automatically synchronize your encrypted vault
              across your desktop PC and mobile phone. SecureX stores your vault in Google Drive's
              hidden <strong>Application Data</strong> folder, completely isolated from personal files.
            </p>

            {/* Google Client ID Setup Card (only shown if not built-in) */}
            {!hasBuiltin && (
              <div
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "1rem",
                }}
              >
                <label style={{ display: "block", fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.35rem" }}>
                  Google OAuth Client ID:
                </label>
                <input
                  type="text"
                  placeholder="e.g. 123456789-xxxxxxxx.apps.googleusercontent.com"
                  value={customClientId}
                  onChange={(e) => {
                    setCustomClientId(e.target.value);
                    if (error) setError(null);
                  }}
                  style={{ width: "100%", marginBottom: "0.5rem" }}
                />

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button
                    type="button"
                    className="ghost small"
                    onClick={() => setShowHelp((prev) => !prev)}
                    style={{ fontSize: "0.8rem", color: "var(--accent)", padding: 0 }}
                  >
                    {showHelp ? "▾ Hide setup guide" : "▸ How to get a Client ID (takes 2 minutes)"}
                  </button>
                  {window.electronAPI?.openUrl && (
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() => void window.electronAPI!.openUrl("https://console.cloud.google.com/apis/credentials")}
                      style={{ fontSize: "0.8rem", color: "var(--muted)", padding: 0 }}
                    >
                      ↗ Open Google Console
                    </button>
                  )}
                </div>

                {showHelp && (
                  <div
                    style={{
                      marginTop: "0.75rem",
                      padding: "0.75rem",
                      background: "rgba(0, 0, 0, 0.25)",
                      border: "1px solid rgba(255, 255, 255, 0.05)",
                      borderRadius: "6px",
                      fontSize: "0.82rem",
                      lineHeight: 1.5,
                    }}
                  >
                    <ol style={{ margin: "0", paddingLeft: "1.25rem" }}>
                      <li>
                        Go to <strong>Google Cloud Console</strong> &gt; <strong>APIs &amp; Services</strong> &gt; <strong>Credentials</strong>.
                      </li>
                      <li>
                        Enable the <strong>Google Drive API</strong> in your project.
                      </li>
                      <li>
                        Under <strong>OAuth consent screen</strong>, select <strong>External</strong>, name it <em>SecureX</em>, and enter your email.
                      </li>
                      <li>
                        Under <strong>Credentials</strong>, click <strong>Create Credentials</strong> ➔ <strong>OAuth client ID</strong>.
                      </li>
                      <li>
                        Select Application type: <strong>Desktop app</strong> (or <strong>Web application</strong>).
                      </li>
                      <li>
                        Copy your generated <strong>Client ID</strong> and paste it into the field above.
                      </li>
                    </ol>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              className="primary block"
              onClick={handleSignIn}
              disabled={busy || (!hasBuiltin && !customClientId.trim())}
              style={{
                padding: "0.75rem 1rem",
                fontSize: "1rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.75rem",
                opacity: !hasBuiltin && !customClientId.trim() ? 0.7 : 1,
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

            {/* Manual Code Fallback (for mobile / browser) */}
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
                  Verify and Connect
                </button>
              </div>
            )}

            {/* Advanced Client Secret setting toggle */}
            <div style={{ marginTop: "0.25rem" }}>
              <button
                type="button"
                className="ghost small"
                onClick={() => setShowAdvanced((prev) => !prev)}
                style={{ fontSize: "0.8rem", color: "var(--muted)", padding: 0 }}
              >
                {showAdvanced ? "▾ Hide Client Secret" : "▸ Optional: Client Secret"}
              </button>

              {showAdvanced && (
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "0.85rem",
                    marginTop: "0.5rem",
                  }}
                >
                  <label className="muted small" style={{ display: "block", marginBottom: "0.25rem" }}>
                    Client Secret (optional for PKCE desktop apps)
                  </label>
                  <input
                    type="password"
                    placeholder="Leave blank for Desktop App type"
                    value={customClientSecret}
                    onChange={(e) => setCustomClientSecret(e.target.value)}
                    style={{ width: "100%", fontSize: "0.85rem" }}
                  />
                </div>
              )}
            </div>

            <button type="button" className="ghost block" onClick={onClose}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
