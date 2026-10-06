import { useCallback, useEffect, useMemo, useState } from "react";
import { formatLastSync } from "@/shared/syncTime";
import { SetupWizard } from "@/components/setup/SetupWizard";
import { UnlockScreen } from "@/components/UnlockScreen";
import { SettingsScreen } from "@/components/SettingsScreen";
import { FirebaseSyncModal } from "@/components/FirebaseSyncModal";
import { useAutoLock } from "@/hooks/useAutoLock";
import { useClipboard } from "@/hooks/useClipboard";
import { useVault } from "@/hooks/useVault";
import { entriesToAutofillCredentials, hostFromUrl } from "@/shared/autofillSync";
import {
  type VaultSyncTarget,
  syncVaultWithFirebase,
  loadFirebaseSyncState,
  subscribeFirebaseSyncConfig,
  subscribeRemoteVault,
  initFirebaseAuthListener,
  signInWithGoogle,
  fetchRemoteVaultFromFirebase,
  type FirebaseSyncState,
} from "@/shared/firebaseSync";
import { isFirebaseConfigured, loadFirebaseConfig } from "@/shared/firebaseConfig";
import { restoreArchivedVault } from "@/shared/accountVaults";
import { DesktopVaultView } from "./DesktopVaultView";
import { DesktopQuickAccess } from "./DesktopQuickAccess";
import { AuthenticatorView } from "@/components/AuthenticatorView";
import { UpdateModal } from "@/components/UpdateModal";
import { Modal } from "@/components/Modal";
import { MpinConfirmFlow } from "@/components/MpinConfirmFlow";
import { checkForAppUpdates, type UpdateCheckResult } from "@/shared/updateService";
import "./desktop.css";

const AUTO_LOCK_MS = 5 * 60 * 1000;

type Nav = "vault" | "authenticator" | "settings";

export default function AppDesktop() {
  const vault = useVault();
  const { copy } = useClipboard();
  const [toast, setToast] = useState<string | null>(null);
  const [nav, setNav] = useState<Nav>("vault");
  const [adding, setAdding] = useState(false);
  const [quickAccess, setQuickAccess] = useState(false);
  const [cloudConfig, setCloudConfig] = useState<FirebaseSyncState | null>(null);
  const [firebaseModalOpen, setFirebaseModalOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [updateToastDismissed, setUpdateToastDismissed] = useState(false);
  const [recoveredMpinPrompt, setRecoveredMpinPrompt] = useState(false);

  useEffect(() => {
    try {
      const needed = sessionStorage.getItem("securex_recovered_needs_mpin") === "true";
      if (needed && !vault.mpinEnabled && vault.unlocked) {
        setRecoveredMpinPrompt(true);
      }
    } catch {}
  }, [vault.mpinEnabled, vault.unlocked]);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);

  // Background update check on startup and periodically
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const res = await checkForAppUpdates();
        if (mounted && res?.hasUpdate) {
          setUpdateInfo(res);
        }
      } catch {}
    };
    void check();
    const interval = setInterval(check, 30 * 60 * 1000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    void initFirebaseAuthListener();
    void loadFirebaseSyncState().then((cfg) => setCloudConfig(cfg));
    return subscribeFirebaseSyncConfig((cfg) => {
      setCloudConfig(cfg);
      setAvatarFailed(false);
    });
  }, []);

  const vaultTarget = useMemo<VaultSyncTarget>(
    () => ({
      unlocked: vault.unlocked,
      exportVault: vault.exportVault,
      mergeUnlockedFromRaw: vault.mergeUnlockedFromRaw,
    }),
    [vault.unlocked, vault.exportVault, vault.mergeUnlockedFromRaw],
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  // Firestore Real-Time Push Listener & Sync on Unlock
  useEffect(() => {
    if (!vault.unlocked) return;

    const triggerSync = async () => {
      const cfg = await loadFirebaseSyncState();
      if (cfg.enabled && cfg.autoSync) {
        const res = await syncVaultWithFirebase(vaultTarget);
        if (res?.error === "REMOTE_DELETED") {
          await vault.deleteAccountAndVault();
          showToast("This vault was deleted on another device.");
        }
      }
    };

    void triggerSync();

    const unsubscribe = subscribeRemoteVault(
      vaultTarget,
      () => {
        void vault.refreshMeta();
      },
      () => {
        void vault.deleteAccountAndVault().then(() => {
          showToast("This vault was deleted on another device.");
        });
      },
    );
    return unsubscribe;
  }, [vault.unlocked, vaultTarget, showToast]);

  // Debounced auto-sync when entries, trash, or people change
  useEffect(() => {
    if (!vault.unlocked) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        const cfg = await loadFirebaseSyncState();
        if (cfg.enabled && cfg.autoSync) {
          const res = await syncVaultWithFirebase(vaultTarget);
          if (res?.error === "REMOTE_DELETED") {
            await vault.deleteAccountAndVault();
            showToast("This vault was deleted on another device.");
          }
        }
      })();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [vault.entries, vault.trashEntries, vault.people, vault.unlocked, vaultTarget, showToast]);

  // Auto-sync on window focus & visibility change
  useEffect(() => {
    if (!vault.unlocked) return;
    const triggerSync = async () => {
      const cfg = await loadFirebaseSyncState();
      if (cfg.enabled && cfg.autoSync) {
        const res = await syncVaultWithFirebase(vaultTarget);
        if (res?.error === "REMOTE_DELETED") {
          await vault.deleteAccountAndVault();
          showToast("This vault was deleted on another device.");
        }
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void triggerSync();
      }
    };

    window.addEventListener("focus", triggerSync);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", triggerSync);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [vault.unlocked, vaultTarget, showToast]);

  useEffect(() => {
    void vault.init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;
    const unsub = window.electronAPI.onLockRequested(() => vault.lock());
    return unsub;
  }, [vault.lock]);

  useEffect(() => {
    if (!window.electronAPI) return;
    return window.electronAPI.onToggleQuickAccess(() => {
      setQuickAccess((prev) => !prev);
    });
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;
    return window.electronAPI.onSaveCredential(({ id, credential }) => {
      if (!vault.unlocked) {
        showToast("Unlock SecureX to save new credentials.");
        window.electronAPI?.sendAutofillResponse(id, { ok: false, error: "LOCKED" });
        return;
      }
      const existing = vault.entries.find(
        (e) =>
          e.url &&
          credential.url &&
          hostFromUrl(e.url) === hostFromUrl(credential.url) &&
          (!credential.username || e.username === credential.username),
      );
      if (existing && credential.password) {
        void vault
          .updateEntry(existing.id, {
            ...existing,
            password: credential.password,
          })
          .then(() => {
            showToast(`Updated password for ${existing.title}`);
            window.electronAPI?.sendAutofillResponse(id, { ok: true });
          });
      } else if (credential.password) {
        const title =
          credential.title || hostFromUrl(credential.url) || "New Account";
        void vault
          .addEntry({
            title,
            personId: vault.people[0]?.id || "",
            categoryId: "other",
            subcategoryId: "other",
            username: credential.username || "",
            password: credential.password,
            url: credential.url || "",
            notes: "Saved via SecureX Autofill",
          })
          .then(() => {
            showToast(`Saved account for ${title}`);
            window.electronAPI?.sendAutofillResponse(id, { ok: true });
          });
      }
    });
  }, [vault, showToast]);

  useEffect(() => {
    const onSettings = () => setNav("settings");
    window.addEventListener("app:navigate-settings", onSettings);
    return () => window.removeEventListener("app:navigate-settings", onSettings);
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;
    return window.electronAPI.onRequestAutofill((data) => {
      if (!vault.unlocked) {
        window.electronAPI!.sendAutofillResponse(data.id, { status: "LOCKED" });
        return;
      }
      
      const reqHost = hostFromUrl(data.url);
      if (!reqHost) {
        window.electronAPI!.sendAutofillResponse(data.id, { status: "OK", credentials: [] });
        return;
      }

      const allCreds = entriesToAutofillCredentials(vault.entries, vault.people);
      const matches = allCreds.filter(c => c.matchHosts.includes(reqHost));
      
      console.log(`[Autofill] Request for URL: ${data.url} -> Host: ${reqHost}`);
      console.log(`[Autofill] Total vault entries: ${vault.entries.length}, Autofillable: ${allCreds.length}`);
      console.log(`[Autofill] Matches found: ${matches.length}`);
      if (matches.length === 0 && allCreds.length > 0) {
        console.log(`[Autofill] Example stored host:`, allCreds[0].matchHosts);
      }
      
      window.electronAPI!.sendAutofillResponse(data.id, { status: "OK", credentials: matches });
    });
  }, [vault.unlocked, vault.entries, vault.people]);

  useAutoLock(vault.unlocked, AUTO_LOCK_MS, vault.lock);

  const handleCopy = useCallback(
    async (label: string, value: string) => {
      if (!value) return;
      await copy(value);
      showToast(`${label} copied - clears in 30s`);
    },
    [copy, showToast],
  );

  if (!vault.ready) {
    return (
      <div className="desktop-loading">
        <p className="muted">Loading...</p>
      </div>
    );
  }

  if (!vault.unlocked) {
    return (
      <div className="desktop-auth">
        <div className="desktop-auth-card">
          {!vault.hasVault ? (
            <SetupWizard
              layout="desktop"
              busy={vault.busy}
              error={vault.error}
              onComplete={async (data) => {
                return await vault.completeSetup(data);
              }}
              onRestoreBackup={(content, password) =>
                vault.importVault(content, password, "replace")
              }
              onVerifyBackup={vault.verifyBackupPassword}
              onCompleteImport={async (content, password, _enableBiometrics, mpin) => {
                const ok = await vault.importVault(content, password, "replace");
                if (ok) {
                  if (mpin && mpin.length === 8) {
                    await vault.setMpin(mpin, mpin);
                  }
                  return true;
                }
                return false;
              }}
              onSwitchCachedAccount={async (uid) => {
                const restored = await restoreArchivedVault(uid);
                if (restored) {
                  await vault.refreshMeta();
                  return true;
                }
                return false;
              }}
              onGoogleSignIn={async () => {
                const config = await loadFirebaseConfig();
                if (!isFirebaseConfigured(config)) {
                  throw new Error("Firebase is not configured. Please check your environment settings.");
                }
                const { user } = await signInWithGoogle();
                const restored = await restoreArchivedVault(user.uid);
                if (restored) {
                  await vault.refreshMeta();
                  return { uid: user.uid, email: user.email || "Google Account", vaultContent: null };
                }
                const vaultContent = await fetchRemoteVaultFromFirebase();
                return { uid: user.uid, email: user.email || "Google Account", vaultContent };
              }}
            />
          ) : (
            <UnlockScreen
              layout="desktop"
              busy={vault.busy}
              error={vault.error}
              biometricsEnabled={false}
              biometricsAvailable={false}
              mpinEnabled={vault.mpinEnabled}
              onUnlockPassword={vault.unlockWithPassword}
              onUnlockMpin={vault.unlockWithMpin}
              onRestoreBackup={(content, password) =>
                vault.importVault(content, password, "replace")
              }
              onResetApp={vault.resetApp}
              onSwitchAccount={vault.switchAccount}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="desktop-shell">
      <aside className="desktop-sidebar">
        <p className="desktop-brand">SECUREX</p>
        <div className="dot-matrix desktop-dots" aria-hidden>
          {Array.from({ length: 12 }).map((_, i) => (
            <span key={i} className={i % 4 === 0 ? "dot dot--accent" : "dot"} />
          ))}
        </div>
        <nav className="desktop-nav">
          <button
            type="button"
            className={nav === "vault" ? "active" : ""}
            onClick={() => setNav("vault")}
          >
            Vault
          </button>
          <button
            type="button"
            className={nav === "authenticator" ? "active" : ""}
            onClick={() => setNav("authenticator")}
          >
            Authenticator
          </button>
          <button
            type="button"
            className={nav === "settings" ? "active" : ""}
            onClick={() => setNav("settings")}
          >
            Settings
          </button>
        </nav>
        <button
          type="button"
          className="desktop-sidebar-footer"
          onClick={() => setFirebaseModalOpen(true)}
        >
          <p className="label-mono">GOOGLE CLOUD SYNC</p>
          <p
            className="muted small"
            style={{
              color: cloudConfig?.enabled ? "var(--accent)" : undefined,
              margin: "2px 0",
            }}
          >
            {cloudConfig?.enabled
              ? `⚡ Cloud: ${cloudConfig.userEmail?.split("@")[0] || "Connected"}`
              : "⚡ Cloud: Offline"}
          </p>
          <p className="muted small desktop-sidebar-cloud-hint">
            {cloudConfig?.enabled
              ? `Push live • ${formatLastSync(cloudConfig.lastSyncAt ?? null)}`
              : "Click to sign in with Google"}
          </p>
        </button>
      </aside>

      <div className="desktop-main">
        <header className="desktop-topbar">
          <div className="desktop-topbar-title">
            <h1>{nav === "vault" ? "Vault" : nav === "authenticator" ? "Authenticator" : "Settings"}</h1>
            {cloudConfig?.enabled && (
              <p className="muted small desktop-topbar-sync-meta">
                Cloud push live | Last sync {formatLastSync(cloudConfig.lastSyncAt ?? null)}
              </p>
            )}
          </div>
          <div className="desktop-topbar-actions">
            {nav !== "vault" && nav !== "authenticator" && (
              <button
                type="button"
                className="ghost small"
                onClick={() => setQuickAccess(true)}
                title="Quick Search (Ctrl+Shift+Space)"
                style={{ fontSize: "0.75rem" }}
              >
                🔍 Quick Search
              </button>
            )}
            {/* Update available icon with red dot next to Google account logo */}
            {updateInfo?.hasUpdate && (
              <button
                type="button"
                className="topbar-update-btn has-update"
                onClick={() => setUpdateModalOpen(true)}
                title={`Update available: v${updateInfo.latestVersion}`}
                aria-label="Update available"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6" />
                  <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-1.19" />
                </svg>
                <span className="topbar-update-dot" />
              </button>
            )}

            <button
              type="button"
              className={`topbar-google-btn${
                cloudConfig?.enabled ? " topbar-google-btn--connected" : ""
              }${
                cloudConfig?.lastSyncStatus === "syncing"
                  ? " topbar-google-btn--syncing"
                  : cloudConfig?.lastSyncStatus === "error"
                    ? " topbar-google-btn--error"
                    : cloudConfig?.lastSyncStatus === "success"
                      ? " topbar-google-btn--success"
                      : ""
              }`}
              title={
                cloudConfig?.enabled
                  ? `Google Cloud Sync (${cloudConfig.userEmail || "Connected"})${
                      cloudConfig.lastSyncStatus === "syncing"
                        ? " - Syncing..."
                        : cloudConfig.lastSyncAt
                          ? " - Synced " + formatLastSync(cloudConfig.lastSyncAt)
                          : ""
                    }`
                  : "Connect Google Account"
              }
              aria-label="Google Cloud sync"
              onClick={() => setFirebaseModalOpen(true)}
            >
              <div className="topbar-google-avatar-wrap">
                {cloudConfig?.enabled && cloudConfig.userPicture && !avatarFailed ? (
                  <img
                    src={cloudConfig.userPicture}
                    alt={cloudConfig.userName || "Google account"}
                    className="topbar-google-avatar"
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarFailed(true)}
                  />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                )}
              </div>
              {cloudConfig?.enabled && cloudConfig.lastSyncStatus && cloudConfig.lastSyncStatus !== "idle" && (
                <span
                  className={`topbar-google-badge topbar-google-badge--${cloudConfig.lastSyncStatus}`}
                  aria-hidden
                />
              )}
            </button>
            {nav === "vault" && (
              <button
                type="button"
                className="primary"
                onClick={() => setAdding(true)}
              >
                + Add password
              </button>
            )}
            <button type="button" className="ghost" onClick={vault.lock}>
              Lock
            </button>
          </div>
        </header>

        {toast && <div className="toast desktop-toast">{toast}</div>}

        {/* Right-side floating notification toast when update is available */}
        {updateInfo?.hasUpdate && !updateToastDismissed && (
          <div className="desktop-update-toast" role="alert">
            <div className="desktop-update-toast-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6" />
                <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-1.19" />
              </svg>
              <span className="topbar-update-dot" style={{ top: -2, right: -2 }} />
            </div>
            <div className="desktop-update-toast-content">
              <span className="desktop-update-toast-title">Update Available</span>
              <span className="desktop-update-toast-desc">
                SecureX v{updateInfo.latestVersion} is ready to install
              </span>
            </div>
            <button
              type="button"
              className="primary small"
              style={{ fontSize: "0.75rem", padding: "4px 10px" }}
              onClick={() => setUpdateModalOpen(true)}
            >
              Update
            </button>
            <button
              type="button"
              className="desktop-update-toast-close"
              onClick={() => setUpdateToastDismissed(true)}
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        )}

        <main className="desktop-content">
          {nav === "settings" ? (
            <SettingsScreen
              people={vault.people}
              biometricsEnabled={false}
              biometricsAvailable={false}
              mpinEnabled={vault.mpinEnabled}
              busy={vault.busy}
              error={vault.error}
              onEnableBiometrics={vault.enableBiometrics}
              onDisableBiometrics={vault.disableBiometrics}
              onSetMpin={vault.setMpin}
              onRemoveMpin={vault.removeMpin}
              onAddPerson={vault.addPerson}
              onUpdatePerson={vault.updatePerson}
              onDeletePerson={vault.deletePerson}
              onChangeMasterPassword={vault.changeMasterPassword}
              onExport={vault.exportVault}
              onImport={vault.importVault}
              onImportChromeCsv={vault.importChromeCsv}
              onMessage={showToast}
              onResetApp={vault.resetApp}
              onDeleteAccount={vault.deleteAccountAndVault}
              onSwitchAccount={vault.switchAccount}
              trashEntries={vault.trashEntries}
              onRestoreTrash={vault.restoreTrashEntry}
              onPurgeTrash={vault.purgeTrashEntry}
              onEmptyTrash={vault.emptyTrash}
              onImportTotp={vault.importTotpAccounts}
              vaultTarget={vaultTarget}
            />
          ) : nav === "authenticator" ? (
            <AuthenticatorView
              entries={vault.entries}
              people={vault.people}
              onAdd={vault.addEntry}
              onUpdate={vault.updateEntry}
              onDelete={vault.deleteEntry}
              onImportTotp={vault.importTotpAccounts}
              onMessage={showToast}
            />
          ) : (
            <DesktopVaultView
              entries={vault.entries}
              people={vault.people}
              adding={adding}
              onAddingChange={setAdding}
              onAdd={vault.addEntry}
              onUpdate={vault.updateEntry}
              onDelete={vault.deleteEntry}
              onCopy={handleCopy}
              onAddPerson={vault.addPerson}
              onMessage={showToast}
            />
          )}
        </main>
      </div>

      {quickAccess && (
        <DesktopQuickAccess
          entries={vault.entries}
          unlocked={vault.unlocked}
          onClose={() => setQuickAccess(false)}
          onCopy={handleCopy}
          onUnlockRequest={() => {
            setQuickAccess(false);
          }}
        />
      )}

      <FirebaseSyncModal
        open={firebaseModalOpen}
        vaultTarget={vaultTarget}
        onClose={() => setFirebaseModalOpen(false)}
        onMessage={showToast}
        onSwitchAccount={vault.switchAccount}
        onRestoredVault={vault.loadRestoredVault}
      />

      <UpdateModal
        open={updateModalOpen}
        onClose={() => setUpdateModalOpen(false)}
        onMessage={showToast}
      />

      <Modal
        title="Set Quick Unlock MPIN"
        open={recoveredMpinPrompt}
        onClose={() => {
          try {
            sessionStorage.removeItem("securex_recovered_needs_mpin");
          } catch {}
          setRecoveredMpinPrompt(false);
        }}
      >
        <div className="stack">
          <p className="muted small">
            Your vault was recovered from your Google account. Set an 8-digit MPIN so you can quickly unlock SecureX instead of entering your Master Password every time.
          </p>
          <MpinConfirmFlow
            size="desktop"
            onComplete={async (code) => {
              const ok = await vault.setMpin(code, code);
              if (ok) {
                try {
                  sessionStorage.removeItem("securex_recovered_needs_mpin");
                } catch {}
                setRecoveredMpinPrompt(false);
                showToast("MPIN set successfully. You can now unlock using your MPIN.");
              }
            }}
          />
          <button
            type="button"
            className="ghost block"
            style={{ marginTop: "8px" }}
            onClick={() => {
              try {
                sessionStorage.removeItem("securex_recovered_needs_mpin");
              } catch {}
              setRecoveredMpinPrompt(false);
            }}
          >
            Skip for now
          </button>
        </div>
      </Modal>
    </div>
  );
}
