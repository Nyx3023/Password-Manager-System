import { useCallback, useEffect, useState } from "react";
import { SetupWizard } from "@/components/setup/SetupWizard";
import { UnlockScreen } from "@/components/UnlockScreen";
import { VaultScreen } from "@/components/VaultScreen";
import { useAutoLock } from "@/hooks/useAutoLock";
import { useClipboard } from "@/hooks/useClipboard";
import { useVault } from "@/hooks/useVault";

const AUTO_LOCK_MS = 5 * 60 * 1000;

export default function App() {
  const vault = useVault();
  const { copy } = useClipboard();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void vault.init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useAutoLock(vault.unlocked, AUTO_LOCK_MS, vault.lock);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3000);
  }, []);

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
          onComplete={vault.completeSetup}
          onRestoreBackup={(content, password) =>
            vault.importVault(content, password, "replace")
          }
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
    />
  );
}
