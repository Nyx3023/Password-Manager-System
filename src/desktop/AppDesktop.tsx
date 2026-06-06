import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TrayStatus } from "@/shared/electron.d";
import { formatLastSync } from "@/shared/syncTime";
import { SetupWizard } from "@/components/setup/SetupWizard";
import { UnlockScreen } from "@/components/UnlockScreen";
import { SettingsScreen } from "@/components/SettingsScreen";
import { SyncIcon, type SyncIconState } from "@/components/SyncIcon";
import { useAutoLock } from "@/hooks/useAutoLock";
import { useClipboard } from "@/hooks/useClipboard";
import { useVault } from "@/hooks/useVault";
import { entriesToAutofillCredentials, hostFromUrl } from "@/shared/autofillSync";
import { DesktopVaultView } from "./DesktopVaultView";
import "./desktop.css";

const AUTO_LOCK_MS = 5 * 60 * 1000;

type Nav = "vault" | "settings";

export default function AppDesktop() {
  const vault = useVault();
  const { copy } = useClipboard();
  const [toast, setToast] = useState<string | null>(null);
  const [nav, setNav] = useState<Nav>("vault");
  const [adding, setAdding] = useState(false);
  const [lanStatus, setLanStatus] = useState<TrayStatus | null>(null);
  const [syncVisual, setSyncVisual] = useState<SyncIconState>("idle");
  const syncVisualTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lanAutoStarted = useRef(false);

  useEffect(() => {
    void vault.init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;
    const unsub = window.electronAPI.onLockRequested(() => vault.lock());
    return unsub;
  }, [vault.lock]);

  const pulseSyncVisual = useCallback(
    (state: SyncIconState, revertMs?: number) => {
      setSyncVisual(state);
      if (syncVisualTimer.current) clearTimeout(syncVisualTimer.current);
      if (revertMs !== undefined && state !== "idle") {
        syncVisualTimer.current = setTimeout(() => {
          setSyncVisual("idle");
          syncVisualTimer.current = null;
        }, revertMs);
      }
    },
    [],
  );

  const refreshLanStatus = useCallback(async () => {
    if (!window.electronAPI) return;
    const st = await window.electronAPI.getTrayStatus();
    setLanStatus(st);
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const startLan = useCallback(async () => {
    if (!window.electronAPI) return;
    const st = await window.electronAPI.startLanServer();
    setLanStatus(st);
    if (st.error) {
      showToast(st.error);
    }
    return st;
  }, [showToast]);

  useEffect(() => {
    if (!window.electronAPI || lanAutoStarted.current) return;
    lanAutoStarted.current = true;
    void (async () => {
      const st = await window.electronAPI!.getTrayStatus();
      if (!st.running) {
        await startLan();
      } else {
        setLanStatus(st);
      }
    })();
  }, [startLan]);

  useEffect(() => {
    if (!window.electronAPI) return;
    return window.electronAPI.onLanVaultUpdated(() => {
      void refreshLanStatus();
      if (!vault.unlocked) return;

      pulseSyncVisual("syncing");
      void vault.reloadFromDiskAfterSync().then((ok) => {
        if (ok) {
          pulseSyncVisual("success", 2000);
        } else {
          pulseSyncVisual("error", 3000);
        }
      });
    });
  }, [
    vault.reloadFromDiskAfterSync,
    vault.unlocked,
    refreshLanStatus,
    pulseSyncVisual,
  ]);

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

  useEffect(() => {
    void refreshLanStatus();
  }, [vault.unlocked, nav, refreshLanStatus]);

  useAutoLock(vault.unlocked, AUTO_LOCK_MS, vault.lock);

  const handleCopy = useCallback(
    async (label: string, value: string) => {
      if (!value) return;
      await copy(value);
      showToast(`${label} copied - clears in 30s`);
    },
    [copy, showToast],
  );

  const stopLan = useCallback(async () => {
    if (!window.electronAPI) return;
    const st = await window.electronAPI.stopLanServer();
    setLanStatus(st);
    showToast("LAN server stopped");
  }, [showToast]);

  const desktopLan = useMemo(() => {
    if (!window.electronAPI) return undefined;
    return {
      status: lanStatus,
      busy: vault.busy,
      onRefresh: refreshLanStatus,
      onStop: stopLan,
      onCopyAddress: (address: string) => {
        void copy(address);
        showToast("Address copied.");
      },
    };
  }, [lanStatus, vault.busy, refreshLanStatus, stopLan, copy, showToast]);

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
              busy={vault.busy}
              error={vault.error}
              onComplete={vault.completeSetup}
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
              onUnlockBiometric={vault.unlockWithBiometrics}
              onRestoreBackup={(content, password) =>
                vault.importVault(content, password, "replace")
              }
              onResetApp={vault.resetApp}
            />
          )}
        </div>
      </div>
    );
  }

  const lanRunning = lanStatus?.running ?? false;
  const iconState: SyncIconState =
    syncVisual === "idle" && lanRunning ? "idle" : syncVisual;

  return (
    <div className="desktop-shell">
      <aside className="desktop-sidebar">
        <p className="desktop-brand">PASSWORD MANAGER</p>
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
            className={nav === "settings" ? "active" : ""}
            onClick={() => setNav("settings")}
          >
            Settings
          </button>
        </nav>
        <button
          type="button"
          className="desktop-sidebar-footer"
          onClick={() => setNav("settings")}
        >
          <p className="label-mono">LAN SYNC</p>
          <p className="muted small">
            {lanRunning ? lanStatus?.address : "Starting..."}
          </p>
          <p className="muted small desktop-sidebar-lan-hint">
            Last sync {formatLastSync(lanStatus?.lastSyncAt ?? null)}
          </p>
        </button>
      </aside>

      <div className="desktop-main">
        <header className="desktop-topbar">
          <div className="desktop-topbar-title">
            <h1>{nav === "vault" ? "Vault" : "Settings"}</h1>
            {lanRunning && (
              <p className="muted small desktop-topbar-sync-meta">
                LAN on | Last sync {formatLastSync(lanStatus?.lastSyncAt ?? null)}
              </p>
            )}
          </div>
          <div className="desktop-topbar-actions">
            <button
              type="button"
              className={`topbar-icon-btn topbar-sync-btn desktop-topbar-sync-btn${
                syncVisual === "success"
                  ? " topbar-sync-btn--success"
                  : syncVisual === "error"
                    ? " topbar-sync-btn--error"
                    : ""
              }`}
              aria-label={
                syncVisual === "syncing" ? "Syncing with phone" : "LAN sync status"
              }
              disabled={syncVisual === "syncing"}
              onClick={() => setNav("settings")}
            >
              <SyncIcon state={iconState} />
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
              desktopLan={desktopLan}
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
    </div>
  );
}
