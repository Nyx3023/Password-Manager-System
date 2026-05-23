import { SetupWizard } from "@/components/setup/SetupWizard";
import { UnlockScreen } from "@/components/UnlockScreen";
import { VaultScreen } from "@/components/VaultScreen";
import { LiquidBackground } from "@/components/LiquidBackground";
import { useMobileApp } from "@/hooks/useMobileApp";

// Import the same CSS layout from desktop for the glass theme
import "@/desktop/AppDesktopGlass.css";

export default function AppMobileGlass() {
  const { vault, toast, desktopLan, handleCopy, showToast } = useMobileApp();

  if (!vault.ready) {
    return (
      <div className="dash glass-layout">
        <LiquidBackground />
        <div className="glass-loading">Loading...</div>
      </div>
    );
  }

  if (!vault.unlocked) {
    if (!vault.hasVault) {
      return (
        <div className="dash glass-layout">
          <LiquidBackground />
          <div className="glass-auth-container">
            <div className="glass glass-auth-card">
              <SetupWizard
                busy={vault.busy}
                error={vault.error}
                onComplete={vault.completeSetup}
                onRestoreBackup={(content, password) =>
                  vault.importVault(content, password, "replace")
                }
              />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="dash glass-layout">
        <LiquidBackground />
        <div className="glass-auth-container">
          <div className="glass glass-auth-card">
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
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-mobile-shell">
      <LiquidBackground />
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
        onPullFromPc={vault.pullFromPc}
        onPushToPc={vault.pushToPc}
        desktopLan={desktopLan}
        syncVisual={vault.syncVisual}
        lastSyncAt={vault.lastSyncAt}
        onSyncVisual={vault.pulseSyncVisual}
      />
    </div>
  );
}
