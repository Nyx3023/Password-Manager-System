import { useCallback, useEffect, useMemo, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { dispatchBackEvent } from "@/shared/backButton";
import { SetupWizard } from "@/components/setup/SetupWizard";
import { UnlockScreen } from "@/components/UnlockScreen";
import { VaultScreen } from "@/components/VaultScreen";
import { useAutoLock } from "@/hooks/useAutoLock";
import { useClipboard } from "@/hooks/useClipboard";
import { useVault } from "@/hooks/useVault";
import { autofillSupported, VaultAutofill } from "@/shared/vaultAutofill";
import {
  type VaultSyncTarget,
  syncVaultWithFirebase,
  loadFirebaseSyncState,
  subscribeRemoteVault,
  initFirebaseAuthListener,
  signInWithGoogle,
  fetchRemoteVaultFromFirebase,
} from "@/shared/firebaseSync";
import { isFirebaseConfigured, loadFirebaseConfig } from "@/shared/firebaseConfig";
import { restoreArchivedVault } from "@/shared/accountVaults";
import { startAutoUpdateWatcher, triggerUpdateCheck } from "@/shared/updateService";

const AUTO_LOCK_MS = 5 * 60 * 1000;

export default function AppMobile() {
  const vault = useVault();
  const { copy } = useClipboard();
  const [toast, setToast] = useState<string | null>(null);

  // Android hardware back button & app lifecycle watcher
  useEffect(() => {
    let unlistenBack: (() => void) | undefined;
    let unlistenState: (() => void) | undefined;

    void CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      const handled = dispatchBackEvent();
      if (!handled) {
        if (canGoBack) {
          window.history.back();
        } else {
          void CapacitorApp.exitApp();
        }
      }
    }).then((handle) => {
      unlistenBack = () => handle.remove();
    });

    startAutoUpdateWatcher();
    void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        void triggerUpdateCheck();
      }
    }).then((handle) => {
      unlistenState = () => handle.remove();
    });

    return () => {
      unlistenBack?.();
      unlistenState?.();
    };
  }, []);

  useEffect(() => {
    void initFirebaseAuthListener();
    void vault.init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autofillSupported()) return;

    const listener = VaultAutofill.addListener("autofillUnlockRequired", () => {
      if (vault.unlocked) {
        void VaultAutofill.notifyUnlocked();
      }
    });

    void VaultAutofill.getPendingAuthentication().then(({ pending }) => {
      if (pending && vault.unlocked) {
        void VaultAutofill.notifyUnlocked();
      }
    });

    return () => {
      void listener.then((h) => h.remove());
    };
  }, [vault.unlocked]);

  useEffect(() => {
    if (!autofillSupported() || !vault.unlocked) return;

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void VaultAutofill.notifyUnlocked();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [vault.unlocked]);

  useAutoLock(vault.unlocked, AUTO_LOCK_MS, vault.lock);

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
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [vault.entries, vault.trashEntries, vault.people, vault.unlocked, vaultTarget, showToast]);

  // Auto-sync on window focus, visibility change, and periodic 60s
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
    const interval = window.setInterval(triggerSync, 60_000);

    return () => {
      window.removeEventListener("focus", triggerSync);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(interval);
    };
  }, [vault.unlocked, vaultTarget, showToast]);

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
      <div className="screen center">
        <p className="muted">Loading...</p>
      </div>
    );
  }

  if (!vault.unlocked) {
    if (!vault.hasVault) {
      return (
        <SetupWizard
          busy={vault.busy}
          error={vault.error}
          onComplete={async (data) => {
            return await vault.completeSetup(data);
          }}
          onRestoreBackup={(content, password) =>
            vault.importVault(content, password, "replace")
          }
          onVerifyBackup={vault.verifyBackupPassword}
          onCompleteImport={async (content, password, enableBiometrics, mpin) => {
            const ok = await vault.importVault(content, password, "replace");
            if (ok) {
              if (enableBiometrics) {
                try { await vault.enableBiometrics(); } catch {}
              }
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
      );
    }

    return (
      <UnlockScreen
        busy={vault.busy}
        error={vault.error}
        biometricsEnabled={vault.biometricsEnabled}
        biometricsAvailable={vault.biometricsAvailable}
        mpinEnabled={vault.mpinEnabled}
        onUnlockPassword={vault.unlockWithPassword}
        onUnlockMpin={vault.unlockWithMpin}
        onUnlockBiometric={vault.unlockWithBiometrics}
        onRestoreBackup={(content, password) =>
          vault.importVault(content, password, "replace")
        }
        onResetApp={vault.resetApp}
        onSwitchAccount={vault.switchAccount}
      />
    );
  }

  return (
    <VaultScreen
      entries={vault.entries}
      people={vault.people}
      biometricsEnabled={vault.biometricsEnabled}
      biometricsAvailable={vault.biometricsAvailable}
      mpinEnabled={vault.mpinEnabled}
      busy={vault.busy}
      error={vault.error}
      toast={toast}
      onLock={vault.lock}
      onAdd={vault.addEntry}
      onUpdate={vault.updateEntry}
      onDelete={vault.deleteEntry}
      onCopy={handleCopy}
      onAddPerson={vault.addPerson}
      onUpdatePerson={vault.updatePerson}
      onDeletePerson={vault.deletePerson}
      onEnableBiometrics={vault.enableBiometrics}
      onDisableBiometrics={vault.disableBiometrics}
      onSetMpin={vault.setMpin}
      onRemoveMpin={vault.removeMpin}
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
      onRestoredVault={vault.loadRestoredVault}
      vaultTarget={vaultTarget}
    />
  );
}
