import { useCallback, useEffect, useState } from "react";
import { Modal } from "./Modal";
import { LoadingIndicator } from "./LoadingIndicator";
import { formatLastSync } from "@/shared/syncTime";
import {
  signInWithGoogle,
  signOutFirebase,
  syncVaultWithFirebase,
  fetchRemoteVaultFromFirebase,
  restoreViaGoogleAccount,
  loadFirebaseSyncState,
  saveFirebaseSyncState,
  type FirebaseSyncConfig,
  type VaultSyncTarget,
} from "@/shared/firebaseSync";
import {
  loadFirebaseConfig,
  saveCustomFirebaseConfig,
  resetCustomFirebaseConfig,
  isFirebaseConfigured,
  type FirebaseProjectConfig,
} from "@/shared/firebaseConfig";
import { getVaultOwnerInfo } from "@/shared/storage";

interface FirebaseSyncModalProps {
  open: boolean;
  vaultTarget: VaultSyncTarget;
  onClose: () => void;
  onMessage: (message: string) => void;
  onSwitchAccount?: () => void;
}

const GoogleIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
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
);

export function FirebaseSyncModal({
  open,
  vaultTarget,
  onClose,
  onMessage,
  onSwitchAccount,
}: FirebaseSyncModalProps) {
  const [syncState, setSyncState] = useState<FirebaseSyncConfig | null>(null);
  const [vaultOwner, setVaultOwner] = useState<{ ownerUid?: string; ownerEmail?: string } | null>(null);
  const [projectConfig, setProjectConfig] = useState<FirebaseProjectConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [mismatchInfo, setMismatchInfo] = useState<{
    user: { uid: string; email?: string; displayName?: string; photoURL?: string };
    currentOwner?: string;
    message: string;
  } | null>(null);

  // Custom config form state
  const [apiKey, setApiKey] = useState("");
  const [projectId, setProjectId] = useState("");
  const [authDomain, setAuthDomain] = useState("");
  const [appId, setAppId] = useState("");

  const reloadData = useCallback(async () => {
    const [state, pConfig, vOwner] = await Promise.all([
      loadFirebaseSyncState(),
      loadFirebaseConfig(),
      getVaultOwnerInfo(),
    ]);
    setSyncState(state);
    setProjectConfig(pConfig);
    setVaultOwner(vOwner);
    setApiKey(pConfig.apiKey || "");
    setProjectId(pConfig.projectId || "");
    setAuthDomain(pConfig.authDomain || "");
    setAppId(pConfig.appId || "");
    setAvatarFailed(false);
  }, []);

  useEffect(() => {
    if (open) {
      void reloadData();
      setError(null);
      setMismatchInfo(null);
    }
  }, [open, reloadData]);

  const configured = isFirebaseConfigured(projectConfig || undefined);

  // 1. Google Sign-In with strict account mismatch rejection
  const handleGoogleSignIn = async () => {
    if (!configured) {
      setError("Please configure your Firebase Project credentials below first.");
      setShowConfig(true);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const vOwner = await getVaultOwnerInfo();
      const targetUid = vOwner?.ownerUid || syncState?.ownerUid || syncState?.userId;
      const targetEmail = vOwner?.ownerEmail || syncState?.ownerEmail || syncState?.userEmail;

      const { user } = await signInWithGoogle();

      // Check 1: If vault is already linked to another account, detect mismatch
      if (targetUid && targetUid !== user.uid) {
        const mismatchMsg = `Account mismatch: This vault belongs to ${targetEmail || targetUid}. Please sign in with ${targetEmail || targetUid}, not ${user.email}.`;
        setMismatchInfo({
          user: {
            uid: user.uid,
            email: user.email || "Google Account",
            displayName: user.displayName || undefined,
            photoURL: user.photoURL || undefined,
          },
          currentOwner: targetEmail || targetUid,
          message: mismatchMsg,
        });
        setError(mismatchMsg);
        onMessage(mismatchMsg);
        await reloadData();
        return;
      }

      // Check 2: If this is an offline vault, check if account already has a cloud vault
      if (!vOwner?.ownerUid) {
        const remoteVault = await fetchRemoteVaultFromFirebase();
        if (remoteVault) {
          const existMsg = `Account ${user.email} already has an existing cloud vault. This local offline vault does not match the cloud vault.`;
          setMismatchInfo({
            user: {
              uid: user.uid,
              email: user.email || "Google Account",
              displayName: user.displayName || undefined,
              photoURL: user.photoURL || undefined,
            },
            currentOwner: "Offline Vault",
            message: existMsg,
          });
          setError(existMsg);
          onMessage(existMsg);
          await reloadData();
          return;
        }
      }

      await saveFirebaseSyncState({
        enabled: true,
        userId: user.uid,
        userEmail: user.email || undefined,
        userName: user.displayName || undefined,
        userPicture: user.photoURL || undefined,
        ownerUid: user.uid,
        ownerEmail: user.email || undefined,
        lastSyncStatus: "idle",
        lastError: null,
      });

      await reloadData();
      onMessage(`Authenticated as ${user.email}`);

      // Automatically sync vault on connect
      const res = await syncVaultWithFirebase(vaultTarget);
      if (res.ok) {
        onMessage("Vault synced with Firebase Cloud.");
        setMismatchInfo(null);
      } else {
        setError(res.error || res.message);
        if (
          res.error?.includes("cannot be decrypted with this device's key") ||
          res.error?.includes("Account mismatch")
        ) {
          setMismatchInfo({
            user: {
              uid: user.uid,
              email: user.email || "Google Account",
              displayName: user.displayName || undefined,
              photoURL: user.photoURL || undefined,
            },
            currentOwner: targetEmail || targetUid,
            message: res.error,
          });
        }
      }
      await reloadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Google sign-in failed";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  // 2. Sign out of this vault & return to landing page
  const handleSignOut = async () => {
    setBusy(true);
    try {
      onClose();
      await signOutFirebase();
      if (onSwitchAccount) {
        await onSwitchAccount();
        onMessage("Signed out of account and vault.");
      } else {
        await reloadData();
        onMessage("Disconnected Google Cloud Sync.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign-out failed");
    } finally {
      setBusy(false);
    }
  };

  // 3. Manual Sync
  const handleManualSync = async () => {
    if (!vaultTarget.unlocked) {
      setError("Vault is locked. Unlock before syncing.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await syncVaultWithFirebase(vaultTarget);
      if (result.ok) {
        onMessage(result.message);
        setMismatchInfo(null);
        await reloadData();
      } else {
        setError(result.error || result.message);
        if (
          result.error?.includes("cannot be decrypted with this device's key") ||
          result.error?.includes("Account mismatch")
        ) {
          if (syncState?.userId) {
            setMismatchInfo({
              user: {
                uid: syncState.userId,
                email: syncState.userEmail || "Google Account",
                displayName: syncState.userName,
                photoURL: syncState.userPicture,
              },
              message: result.error,
            });
          }
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  // Restore via Google Account when a vault mismatch is detected
  const handleRestoreGoogleAccount = async () => {
    if (!mismatchInfo) return;
    setBusy(true);
    setError(null);
    try {
      await restoreViaGoogleAccount(mismatchInfo.user);
      onMessage(`Cloud vault restored for ${mismatchInfo.user.email || "Google account"}. Enter your Master Password.`);
      onClose();
      if (onSwitchAccount) {
        await onSwitchAccount();
      } else {
        window.location.reload();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to restore cloud vault.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  // 4. Save Custom Project Config
  const handleSaveConfig = async () => {
    if (!apiKey.trim() || !projectId.trim() || !appId.trim()) {
      setError("API Key, Project ID, and App ID are required.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await saveCustomFirebaseConfig({
        apiKey: apiKey.trim(),
        projectId: projectId.trim(),
        authDomain: authDomain.trim() || `${projectId.trim()}.firebaseapp.com`,
        appId: appId.trim(),
      });
      await reloadData();
      setShowConfig(false);
      onMessage("Firebase Project configuration updated.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save configuration");
    } finally {
      setBusy(false);
    }
  };

  const handleResetConfig = async () => {
    setBusy(true);
    try {
      await resetCustomFirebaseConfig();
      await reloadData();
      onMessage("Reset to environment configuration.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  const isConnected = Boolean(syncState?.enabled && syncState?.userId);
  const boundEmail = syncState?.ownerEmail || vaultOwner?.ownerEmail || syncState?.userEmail;
  const isSessionExpired = Boolean(
    syncState?.lastSyncStatus === "error" &&
    (syncState?.lastError?.toLowerCase().includes("expired") ||
     syncState?.lastError?.toLowerCase().includes("sign in"))
  );

  return (
    <Modal open={open} title="Google Cloud Sync (Firebase)" onClose={onClose}>
      <div className="google-drive-sync-modal stack">
        {/* Top notification / error banner */}
        {error && <div className="callout callout--danger">{error}</div>}

        {/* Restore via Google Account (ONLY displayed when vault does not match cloud vault) */}
        {mismatchInfo && (
          <div
            className="callout callout--danger"
            style={{
              background: "rgba(255, 68, 56, 0.08)",
              border: "1px solid rgba(255, 68, 56, 0.35)",
              borderRadius: "8px",
              padding: "14px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              textAlign: "left",
            }}
          >
            <div
              style={{
                color: "var(--accent, #ff4438)",
                fontWeight: 700,
                fontSize: "0.95rem",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>⚠️</span> Vault Mismatch Detected
            </div>
            <p style={{ color: "#eee", fontSize: "0.85rem", margin: 0, lineHeight: 1.4 }}>
              {mismatchInfo.message}
            </p>
            <p style={{ color: "#888", fontSize: "0.75rem", margin: 0 }}>
              You can restore the cloud vault for <strong>{mismatchInfo.user.email}</strong> onto this device. Your current local vault will be safely archived on this device before restoring.
            </p>
            <button
              type="button"
              className="primary block"
              disabled={busy}
              onClick={handleRestoreGoogleAccount}
              style={{
                background: "var(--accent, #ff4438)",
                color: "#fff",
                borderColor: "var(--accent, #ff4438)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                padding: "10px",
                marginTop: "4px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <span>🔄</span> Restore via Google Account ({mismatchInfo.user.email})
            </button>
          </div>
        )}

        {/* Zero-knowledge security guarantee banner */}
        <div className="callout callout--info">
          <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
            <span style={{ fontSize: "1.4rem" }}>🛡️</span>
            <div>
              <strong style={{ display: "block", color: "var(--text)", fontSize: "0.85rem", marginBottom: "2px" }}>
                100% Zero-Knowledge Privacy
              </strong>
              <p className="small muted" style={{ margin: 0, lineHeight: 1.35 }}>
                Your usernames, passwords, notes, and metadata are encrypted client-side with Argon2id + AES-256-GCM.
                Firebase stores <strong>zero plaintext</strong>.
              </p>
            </div>
          </div>
        </div>

        {/* Connected Profile State */}
        {isConnected ? (
          <div className="setup-card stack">
            {/* If session is expired, show prominent re-auth banner */}
            {isSessionExpired && (
              <div
                className="callout callout--danger"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  padding: "12px 14px",
                  background: "rgba(234, 67, 53, 0.08)",
                  border: "1px solid rgba(234, 67, 53, 0.4)",
                  borderRadius: "8px",
                  marginBottom: "8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "1.3rem" }}>⚠️</span>
                  <div>
                    <strong style={{ color: "#EA4335" }}>Google Session Expired</strong>
                    <div className="small muted" style={{ marginTop: "2px" }}>
                      Cloud sync is paused. Please sign in to <strong>{boundEmail}</strong> again to resume syncing.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="primary block"
                  disabled={busy}
                  onClick={handleGoogleSignIn}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    padding: "9px 12px",
                    fontWeight: 600,
                  }}
                >
                  <GoogleIcon size={18} />
                  <span>{busy ? "Signing in..." : `Sign in to ${boundEmail || "Google"} Again`}</span>
                </button>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  overflow: "hidden",
                  background: "var(--bg-elevated)",
                  border: "2px solid var(--border)",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                {syncState?.userPicture && !avatarFailed ? (
                  <img
                    src={syncState.userPicture}
                    alt={syncState.userName || "Google User"}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarFailed(true)}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24">
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
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 600, fontSize: "0.95rem" }}>
                  {syncState?.userName || "Google Account"}
                </p>
                <p className="muted small" style={{ margin: "2px 0 0", wordBreak: "break-all" }}>
                  {syncState?.userEmail}
                </p>
                <div style={{ fontSize: "0.74rem", color: "var(--accent)", marginTop: "2px", fontWeight: 500 }}>
                  🔒 Bound Vault: {boundEmail}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: isSessionExpired ? "#EA4335" : "#34A853",
                      display: "inline-block",
                      boxShadow: isSessionExpired
                        ? "0 0 6px rgba(234, 67, 53, 0.6)"
                        : "0 0 6px rgba(52, 168, 83, 0.6)",
                    }}
                  />
                  <span
                    style={{
                      fontSize: "0.72rem",
                      color: isSessionExpired ? "#EA4335" : "#34A853",
                      fontWeight: 600,
                    }}
                  >
                    {isSessionExpired ? "Sync Paused (Session Expired)" : "Real-Time Cloud Push Active"}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px", marginTop: "4px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "8px" }}>
                <span className="muted">Last synchronized</span>
                <strong>{formatLastSync(syncState?.lastSyncAt)}</strong>
              </div>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                <span>Automatic Background Sync</span>
                <input
                  type="checkbox"
                  checked={syncState?.autoSync ?? true}
                  onChange={async (e) => {
                    const next = e.target.checked;
                    await saveFirebaseSyncState({ autoSync: next });
                    await reloadData();
                  }}
                />
              </label>
            </div>

            <div style={{ display: "flex", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
              {isSessionExpired ? (
                <button
                  type="button"
                  className="primary"
                  style={{ flex: 1, minWidth: "120px" }}
                  disabled={busy}
                  onClick={handleGoogleSignIn}
                >
                  {busy ? <LoadingIndicator label="Signing in..." /> : "Sign In Again"}
                </button>
              ) : (
                <button
                  type="button"
                  className="primary"
                  style={{ flex: 1, minWidth: "100px" }}
                  disabled={busy}
                  onClick={handleManualSync}
                >
                  {busy ? <LoadingIndicator label="Syncing..." /> : "Sync Now"}
                </button>
              )}
              <button
                type="button"
                className="ghost danger"
                disabled={busy}
                onClick={handleSignOut}
              >
                Sign Out
              </button>
            </div>
          </div>
        ) : (
          /* Disconnected State — Prominent Google Sign In */
          <div className="setup-card stack" style={{ textAlign: "center", padding: "24px 16px" }}>
            <div style={{ margin: "0 auto 8px" }}>
              <GoogleIcon size={40} />
            </div>

            <h3 style={{ margin: "0 0 6px", fontSize: "1.1rem" }}>Sync With Google Cloud</h3>
            <p className="muted small" style={{ margin: "0 0 14px", lineHeight: 1.4 }}>
              Sign in with your Google account to automatically push and pull encrypted passwords across all your devices in real-time.
            </p>

            {boundEmail ? (
              <div className="callout callout--info" style={{ textAlign: "left", marginBottom: "16px" }}>
                <strong>🔒 Bound Account:</strong> {boundEmail}
                <div className="small muted" style={{ marginTop: "3px" }}>
                  This vault belongs to {boundEmail}. Only this Google account can sync with this vault.
                </div>
              </div>
            ) : (
              <div className="callout callout--info" style={{ textAlign: "left", marginBottom: "16px" }}>
                <strong>🌐 Offline Vault (Unlinked)</strong>
                <div className="small muted" style={{ marginTop: "3px" }}>
                  Signing in with a Google account will link and upload this vault to that account.
                </div>
              </div>
            )}

            <button
              type="button"
              className="primary block"
              disabled={busy}
              onClick={handleGoogleSignIn}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                padding: "12px",
                fontSize: "0.95rem",
              }}
            >
              <GoogleIcon size={18} />
              <span>{busy ? "Signing in…" : (boundEmail ? `Sign in to ${boundEmail}` : "Sign in with Google")}</span>
            </button>
          </div>
        )}

        {/* Project Configuration Accordion */}
        <div style={{ marginTop: "4px" }}>
          <button
            type="button"
            className="ghost small block"
            onClick={() => setShowConfig((prev) => !prev)}
            style={{ fontSize: "0.74rem", letterSpacing: "0.08em", opacity: 0.7 }}
          >
            {showConfig ? "▾ Hide Firebase Project Configuration" : "▸ Firebase Project Configuration (.env)"}
          </button>

          {showConfig && (
            <div className="setup-card stack" style={{ marginTop: "8px", background: "rgba(0,0,0,0.15)" }}>
              <p className="muted small" style={{ margin: 0 }}>
                Configure credentials from your Firebase Console. Alternatively, set <code>VITE_FIREBASE_API_KEY</code> and <code>VITE_FIREBASE_PROJECT_ID</code> in <code>.env</code>.
              </p>

              <label>
                API Key
                <input
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                />
              </label>

              <label>
                Project ID
                <input
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  placeholder="securex-XXXXX"
                />
              </label>

              <label>
                App ID
                <input
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  placeholder="1:1023472971995:web:..."
                />
              </label>

              <label>
                Auth Domain (Optional)
                <input
                  value={authDomain}
                  onChange={(e) => setAuthDomain(e.target.value)}
                  placeholder="project-id.firebaseapp.com"
                />
              </label>

              <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                <button
                  type="button"
                  className="primary small"
                  disabled={busy}
                  onClick={handleSaveConfig}
                >
                  Save Configuration
                </button>
                <button
                  type="button"
                  className="ghost small"
                  disabled={busy}
                  onClick={handleResetConfig}
                >
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
