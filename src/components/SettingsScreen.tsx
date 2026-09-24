import { FormEvent, useEffect, useState, type ReactNode } from "react";
import { autofillSupported, VaultAutofill } from "@/shared/vaultAutofill";
import type { ImportMode, Person, PersonCategoryId, TrashEntry } from "@/shared/types";
import type { TotpAccount } from "@/shared/totp";
import {
  exportVaultToDevice,
  pickVaultImportFile,
} from "@/shared/transfer";
import { CsvImporter } from "./CsvImporter";
import { Modal } from "./Modal";
import { MpinConfirmFlow } from "./MpinConfirmFlow";
import { PasswordRequirements } from "./PasswordRequirements";
import { PeopleManager } from "./PeopleManager";
import { TrashBinModal } from "./TrashBinModal";
import { TotpImporterModal } from "./TotpImporterModal";
import { validateMasterPassword } from "@/shared/passwordPolicy";
import { DesktopExtensionPanel } from "@/desktop/DesktopExtensionPanel";
import { FirebaseSyncModal } from "./FirebaseSyncModal";
import { HoldToConfirmButton } from "./HoldToConfirmButton";
import {
  subscribeFirebaseSyncConfig,
  type FirebaseSyncState,
  type VaultSyncTarget,
} from "@/shared/firebaseSync";

type SettingsModal =
  | "people"
  | "mpin"
  | "password"
  | "backup"
  | "csv"
  | "autofill"
  | "trash"
  | "totp"
  | "firebase"
  | null;

interface SettingsScreenProps {
  people: Person[];
  biometricsEnabled: boolean;
  biometricsAvailable: boolean;
  mpinEnabled: boolean;
  busy: boolean;
  error: string | null;
  onEnableBiometrics: () => Promise<boolean>;
  onDisableBiometrics: () => Promise<boolean>;
  onSetMpin: (mpin: string, confirm: string) => Promise<boolean>;
  onRemoveMpin: () => Promise<boolean>;
  onAddPerson: (
    name: string,
    category: PersonCategoryId,
    emoji?: string,
  ) => Promise<Person | null>;
  onUpdatePerson: (
    id: string,
    update: { name?: string; category?: PersonCategoryId; emoji?: string },
  ) => Promise<void>;
  onDeletePerson: (id: string) => Promise<{ entriesRemoved: number }>;
  onChangeMasterPassword: (
    current: string,
    next: string,
    confirm: string,
  ) => Promise<boolean>;
  onExport: () => Promise<string>;
  onImport: (
    content: string,
    password: string,
    mode: ImportMode,
  ) => Promise<boolean>;
  onImportChromeCsv: (csv: string, personId: string) => Promise<number>;
  onMessage: (message: string) => void;
  onResetApp?: () => Promise<boolean>;
  onDeleteAccount?: () => Promise<boolean>;
  onSwitchAccount?: () => Promise<boolean>;
  trashEntries?: TrashEntry[];
  onRestoreTrash?: (id: string) => Promise<unknown>;
  onPurgeTrash?: (id: string) => Promise<unknown>;
  onEmptyTrash?: () => Promise<unknown>;
  onImportTotp?: (accounts: TotpAccount[], personId: string) => Promise<number>;
  vaultTarget?: VaultSyncTarget;
}

function SettingsRow({
  label,
  hint,
  onClick,
  trailing,
}: {
  label: string;
  hint?: string;
  onClick?: () => void;
  trailing?: ReactNode;
}) {
  if (onClick) {
    return (
      <button type="button" className="settings-row" onClick={onClick}>
        <span className="settings-row-text">
          <span className="settings-row-label">{label}</span>
          {hint && <span className="settings-row-hint">{hint}</span>}
        </span>
        <span className="settings-row-chevron" aria-hidden>
          ›
        </span>
      </button>
    );
  }

  return (
    <div className="settings-row settings-row--static">
      <span className="settings-row-text">
        <span className="settings-row-label">{label}</span>
        {hint && <span className="settings-row-hint">{hint}</span>}
      </span>
      {trailing && <span className="settings-row-trailing">{trailing}</span>}
    </div>
  );
}

export function SettingsScreen(props: SettingsScreenProps) {
  const [modal, setModal] = useState<SettingsModal>(null);
  const [autofillEnabled, setAutofillEnabled] = useState(false);
  const [cloudConfig, setCloudConfig] = useState<FirebaseSyncState | null>(null);

  useEffect(() => {
    return subscribeFirebaseSyncConfig((cfg) => setCloudConfig(cfg));
  }, []);

  useEffect(() => {
    if (!autofillSupported()) return;
    void VaultAutofill.isEnabled().then(({ enabled }) => setAutofillEnabled(enabled));
  }, []);

  const [autoStart, setAutoStart] = useState(false);

  useEffect(() => {
    if (window.electronAPI?.getAutoStart) {
      void window.electronAPI.getAutoStart().then((enabled) => setAutoStart(enabled));
    }
  }, []);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  const [importPw, setImportPw] = useState("");
  const [importMode, setImportMode] = useState<ImportMode>("merge");

  const closeModal = () => {
    setModal(null);
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    setImportPw("");
  };

  const newPwValid = validateMasterPassword(newPw).valid;

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    if (!newPwValid) return;
    const ok = await props.onChangeMasterPassword(currentPw, newPw, confirmPw);
    if (ok) {
      closeModal();
      props.onMessage("Master password updated.");
    }
  };

  const handleExport = async () => {
    try {
      const data = await props.onExport();
      await exportVaultToDevice(data);
      props.onMessage("Vault exported.");
    } catch (e) {
      props.onMessage(e instanceof Error ? e.message : "Export failed.");
    }
  };

  const handleImport = async () => {
    try {
      const content = await pickVaultImportFile();
      if (!importPw) {
        props.onMessage("Enter the backup file's master password first.");
        return;
      }
      const ok = await props.onImport(content, importPw, importMode);
      if (ok) {
        closeModal();
        props.onMessage(
          importMode === "merge" ? "Vault merged." : "Vault replaced.",
        );
      }
    } catch (e) {
      props.onMessage(e instanceof Error ? e.message : "Import failed.");
    }
  };

  return (
    <div className="settings">
      {window.electronAPI && (
        <div className="settings-span-full">
          <DesktopExtensionPanel />
        </div>
      )}

      <div className="settings-grid">
      <section className="settings-group">
        <SettingsRow
          label="People"
          hint={`${props.people.length} saved`}
          onClick={() => setModal("people")}
        />
        <SettingsRow
          label="Master password"
          hint="Change encryption password"
          onClick={() => setModal("password")}
        />
        <SettingsRow
          label="MPIN"
          hint={props.mpinEnabled ? "Required to unlock" : "Not set - add one"}
          onClick={() => setModal("mpin")}
        />
        <SettingsRow
          label="Backup & restore"
          hint="Export or import .pms file"
          onClick={() => setModal("backup")}
        />
        {props.vaultTarget && (
          <SettingsRow
            label="Google Cloud Sync"
            hint={
              cloudConfig?.ownerEmail
                ? `Bound to ${cloudConfig.ownerEmail}`
                : cloudConfig?.enabled && cloudConfig?.userEmail
                  ? `Connected (${cloudConfig.userEmail})`
                  : "Zero-knowledge cloud sync & real-time push"
            }
            onClick={() => setModal("firebase")}
          />
        )}
        <SettingsRow
          label="Chrome passwords"
          hint="Import from CSV export"
          onClick={() => setModal("csv")}
        />
        <SettingsRow
          label="Trash & Recycle bin"
          hint={props.trashEntries?.length ? `${props.trashEntries.length} deleted items` : "Empty"}
          onClick={() => setModal("trash")}
        />
        <SettingsRow
          label="Import 2FA accounts"
          hint="Google Authenticator, Aegis, 2FAS, URI"
          onClick={() => setModal("totp")}
        />
        {window.electronAPI?.setAutoStart && (
          <SettingsRow
            label="Launch on system startup"
            hint={autoStart ? "Enabled (starts in tray)" : "Disabled"}
            trailing={
              <button
                type="button"
                className={`toggle${autoStart ? " on" : ""}`}
                aria-pressed={autoStart}
                onClick={async () => {
                  const next = !autoStart;
                  const res = await window.electronAPI!.setAutoStart(next);
                  setAutoStart(res);
                }}
              />
            }
          />
        )}
      </section>

      {autofillSupported() && (
        <section className="settings-group">
          <SettingsRow
            label="Android autofill"
            hint={
              autofillEnabled
                ? "Set up Chrome if Google still appears"
                : "Required — then configure Chrome"
            }
            onClick={() => setModal("autofill")}
          />
        </section>
      )}

      {!window.electronAPI && props.biometricsAvailable && (
        <section className="settings-group">
          <SettingsRow
            label="Biometric unlock"
            hint={
              props.biometricsEnabled
                ? "Enabled"
                : "Disabled"
            }
            trailing={
              <button
                type="button"
                className={`toggle${props.biometricsEnabled ? " on" : ""}`}
                disabled={props.busy}
                aria-pressed={props.biometricsEnabled}
                onClick={() =>
                  props.biometricsEnabled
                    ? void props.onDisableBiometrics()
                    : void props.onEnableBiometrics()
                }
              />
            }
          />
        </section>
      )}

      {props.onSwitchAccount && (
        <section className="settings-group">
          <SettingsRow
            label="Switch Account / Vault"
            hint={
              cloudConfig?.ownerEmail
                ? `Active account: ${cloudConfig.ownerEmail}`
                : "Switch to a different account or offline vault"
            }
            onClick={() => {
              void props.onSwitchAccount?.();
            }}
          />
        </section>
      )}

      {(props.onDeleteAccount || props.onResetApp) && (
        <section className="settings-group settings-group--danger">
          <div style={{ padding: "12px 14px 6px" }}>
            <span style={{ color: "#ef4444", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", display: "block", marginBottom: "4px" }}>
              Danger Zone
            </span>
            <p className="muted small" style={{ margin: "0 0 12px", lineHeight: 1.45, fontSize: "0.82rem" }}>
              Permanently delete this account, erase all cloud data from Firestore, and wipe all local passwords on this device.
            </p>
            <HoldToConfirmButton
              label="Hold to Delete Account & Passwords"
              activeLabel="Keep holding to delete…"
              durationMs={3000}
              onConfirm={async () => {
                if (props.onDeleteAccount) {
                  const done = await props.onDeleteAccount();
                  if (done) props.onMessage("Account and all passwords deleted.");
                } else if (props.onResetApp) {
                  const done = await props.onResetApp();
                  if (done) props.onMessage("App reset. First-time setup will start.");
                }
              }}
            />
          </div>
        </section>
      )}
      </div>

      {props.error && <p className="error">{props.error}</p>}

      <Modal title="Autofill setup" open={modal === "autofill"} onClose={closeModal}>
        <div className="stack autofill-setup">
          <p className="muted small">
            1. Set Password Manager as the Android autofill service (button
            below).
          </p>
          <p className="muted small">
            2. In Chrome: Settings - Autofill - choose &quot;Autofill using
            another service&quot; (Chrome 131+).
          </p>
          <p className="muted small">
            3. Unlock your vault here, then tap a login field on a site.
          </p>

          <button
            type="button"
            className="primary block"
            onClick={() => void VaultAutofill.openSettings()}
          >
            Open Android autofill settings
          </button>
          <button type="button" className="ghost block" onClick={closeModal}>
            Done
          </button>
        </div>
      </Modal>

      <Modal title="People" open={modal === "people"} onClose={closeModal}>
        <PeopleManager
          embedded
          people={props.people}
          onAdd={props.onAddPerson}
          onUpdate={props.onUpdatePerson}
          onDelete={props.onDeletePerson}
          onMessage={props.onMessage}
        />
      </Modal>

      <Modal title="Master password" open={modal === "password"} onClose={closeModal}>
        <form className="stack" onSubmit={handlePasswordChange}>
          <label>
            Current password
            <input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              required
              autoFocus
            />
          </label>
          <label>
            New password
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              required
            />
          </label>
          <PasswordRequirements password={newPw} />
          <label>
            Confirm new password
            <input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              required
            />
          </label>
          {newPw && confirmPw && newPw !== confirmPw && (
            <p className="error">Passwords do not match.</p>
          )}
          <button
            type="submit"
            className="primary block"
            disabled={
              props.busy ||
              !newPwValid ||
              !confirmPw ||
              newPw !== confirmPw
            }
          >
            Update password
          </button>
        </form>
      </Modal>

      <Modal title="MPIN" open={modal === "mpin"} onClose={closeModal}>
        <div className="stack">
          <p className="muted small">
            {props.mpinEnabled
              ? "Enter a new MPIN twice to replace the current one."
              : "Enter your 8-digit MPIN twice. Required to unlock the app."}
          </p>
          <MpinConfirmFlow
            onComplete={(code) => {
              void props.onSetMpin(code, code).then((ok) => {
                if (ok) {
                  closeModal();
                  props.onMessage(
                    props.mpinEnabled ? "MPIN updated." : "MPIN saved.",
                  );
                }
              });
            }}
          />
        </div>
      </Modal>

      <Modal title="Backup & restore" open={modal === "backup"} onClose={closeModal}>
        <div className="stack">
          <p className="muted small">
            Encrypted .pms files need your master password to open.
          </p>
          <button
            type="button"
            className="primary block"
            disabled={props.busy}
            onClick={() => void handleExport()}
          >
            Export vault
          </button>
          <label>
            Backup password
            <input
              type="password"
              value={importPw}
              onChange={(e) => setImportPw(e.target.value)}
              placeholder="Password used for backup"
            />
          </label>
          <label>
            Import mode
            <select
              value={importMode}
              onChange={(e) => setImportMode(e.target.value as ImportMode)}
            >
              <option value="merge">Merge with existing</option>
              <option value="replace">Replace entire vault</option>
            </select>
          </label>
          <button
            type="button"
            className="ghost block"
            disabled={props.busy}
            onClick={() => void handleImport()}
          >
            Import vault file
          </button>
        </div>
      </Modal>

      <Modal title="Chrome import" open={modal === "csv"} onClose={closeModal}>
        <CsvImporter
          people={props.people}
          busy={props.busy}
          onImport={props.onImportChromeCsv}
          onMessage={props.onMessage}
        />
      </Modal>

      {modal === "trash" && props.onRestoreTrash && props.onPurgeTrash && props.onEmptyTrash && (
        <TrashBinModal
          trashEntries={props.trashEntries || []}
          onRestore={props.onRestoreTrash}
          onPurge={props.onPurgeTrash}
          onEmptyTrash={props.onEmptyTrash}
          onClose={closeModal}
          onMessage={props.onMessage}
        />
      )}

      {modal === "totp" && props.onImportTotp && (
        <TotpImporterModal
          people={props.people}
          onImport={props.onImportTotp}
          onClose={closeModal}
          onMessage={props.onMessage}
        />
      )}

      {props.vaultTarget && (
        <FirebaseSyncModal
          open={modal === "firebase"}
          vaultTarget={props.vaultTarget}
          onClose={closeModal}
          onMessage={props.onMessage}
          onSwitchAccount={props.onSwitchAccount ? () => { void props.onSwitchAccount?.(); } : undefined}
        />
      )}

    </div>
  );
}

