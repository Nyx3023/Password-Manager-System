import { useCallback, useEffect, useMemo, useState } from "react";
import type { TrayStatus } from "@/shared/electron.d";
import { SetupWizard } from "@/components/setup/SetupWizard";
import { UnlockScreen } from "@/components/UnlockScreen";
import { SettingsScreen } from "@/components/SettingsScreen";
import { useAutoLock } from "@/hooks/useAutoLock";
import { useClipboard } from "@/hooks/useClipboard";
import { useVault } from "@/hooks/useVault";
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

  useEffect(() => {
    void vault.init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;
    const unsub = window.electronAPI.onLockRequested(() => vault.lock());
    return unsub;
  }, [vault.lock]);

  const refreshLanStatus = useCallback(async () => {
    if (!window.electronAPI) return;
    const st = await window.electronAPI.getTrayStatus();
    setLanStatus(st);
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;
    return window.electronAPI.onLanVaultUpdated(() => {
      void refreshLanStatus();
      if (vault.unlocked) {
        void vault.reloadFromDiskAfterSync().then((ok) => {
          if (ok) showToast("Vault updated from phone.");
        });
      }
    });
  }, [vault.reloadFromDiskAfterSync, vault.unlocked, refreshLanStatus, showToast]);

  useEffect(() => {
    const onSettings = () => setNav("settings");
    window.addEventListener("app:navigate-settings", onSettings);
    return () => window.removeEventListener("app:navigate-settings", onSettings);
  }, []);

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

  const startLan = useCallback(async () => {
    if (!window.electronAPI) return;
    const st = await window.electronAPI.startLanServer();
    setLanStatus(st);
    if (st.error) {
      showToast(st.error);
      return;
    }
    showToast(st.running ? `LAN server on ${st.address}` : "Could not start LAN server.");
  }, [showToast]);

  const stopLan = useCallback(async () => {
    if (!window.electronAPI) return;
    const st = await window.electronAPI.stopLanServer();
    setLanStatus(st);
    showToast("LAN server stopped");
  }, [showToast]);

  const newLanPairingCode = useCallback(async () => {
    if (!window.electronAPI) return;
    const st = await window.electronAPI.newLanPairingCode();
    setLanStatus(st);
    showToast(st.pairingCode ? "New pairing code ready." : "Start the LAN server first.");
  }, [showToast]);

  const desktopLan = useMemo(() => {
    if (!window.electronAPI) return undefined;
    return {
      status: lanStatus,
      busy: vault.busy,
      onRefresh: refreshLanStatus,
      onStart: startLan,
      onStop: stopLan,
      onNewPairingCode: newLanPairingCode,
      onCopyAddress: (address: string) => {
        void copy(address);
        showToast("Address copied.");
      },
      onCopyPairingCode: (code: string) => {
        void copy(code);
        showToast("Pairing code copied.");
      },
      onReloadVault: async () => {
        const ok = await vault.reloadFromDiskAfterSync();
        showToast(ok ? "Vault reloaded." : "Reload failed.");
      },
    };
  }, [
    lanStatus,
    vault.busy,
    refreshLanStatus,
    startLan,
    stopLan,
    newLanPairingCode,
    copy,
    showToast,
    vault.reloadFromDiskAfterSync,
  ]);

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
            {lanStatus?.running ? lanStatus.address : "Server off"}
          </p>
          {lanStatus?.pairingCode && (
            <p className="small">Code: {lanStatus.pairingCode}</p>
          )}
          <p className="muted small desktop-sidebar-lan-hint">Open settings</p>
        </button>
      </aside>

      <div className="desktop-main">
        <header className="desktop-topbar">
          <h1>{nav === "vault" ? "Vault" : "Settings"}</h1>
          <div className="desktop-topbar-actions">
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
