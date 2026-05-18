import { FormEvent, useEffect, useState, type ReactNode } from "react";
import { autofillSupported, VaultAutofill } from "@/shared/vaultAutofill";
import type { ImportMode, Person, PersonCategoryId } from "@/shared/types";
import {
  exportVaultToDevice,
  pickVaultImportFile,
} from "@/shared/transfer";
import { CsvImporter } from "./CsvImporter";
import { Modal } from "./Modal";
import { MpinConfirmFlow } from "./MpinConfirmFlow";
import { PasswordRequirements } from "./PasswordRequirements";
import { PeopleManager } from "./PeopleManager";
import { validateMasterPassword } from "@/shared/passwordPolicy";

type SettingsModal =
  | "people"
  | "mpin"
  | "password"
  | "backup"
  | "csv"
  | "autofill"
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
      {trailing}
    </div>
  );
}

export function SettingsScreen(props: SettingsScreenProps) {
  const [modal, setModal] = useState<SettingsModal>(null);
  const [autofillEnabled, setAutofillEnabled] = useState(false);

  useEffect(() => {
    if (!autofillSupported()) return;
    void VaultAutofill.isEnabled().then(({ enabled }) => setAutofillEnabled(enabled));
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

  const handleReset = async () => {
    if (!props.onResetApp) return;
    const ok = confirm(
      "Erase all vault data, people, passwords, and cached icons? This cannot be undone.",
    );
    if (!ok) return;
    const done = await props.onResetApp();
    if (done) props.onMessage("App reset. First-time setup will start.");
  };

  return (
    <div className="settings">
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
        <SettingsRow
          label="Chrome passwords"
          hint="Import from CSV export"
          onClick={() => setModal("csv")}
        />
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

      <section className="settings-group">
        <SettingsRow
          label="Biometric unlock"
          hint={
            !props.biometricsAvailable
              ? "Not available"
              : props.biometricsEnabled
                ? "Enabled"
                : "Disabled"
          }
          trailing={
            props.biometricsAvailable ? (
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
            ) : null
          }
        />
      </section>

      {props.onResetApp && (
        <section className="settings-group settings-group--dev">
          <button
            type="button"
            className="settings-row settings-row--danger"
            onClick={() => void handleReset()}
          >
            <span className="settings-row-label">Reset app (dev)</span>
            <span className="settings-row-hint">Clear data & run setup again</span>
          </button>
        </section>
      )}

      {props.error && <p className="error">{props.error}</p>}

      <Modal title="Autofill setup" open={modal === "autofill"} onClose={closeModal}>
        <div className="stack autofill-setup">
          <p className="setup-sub">
            Chrome uses <strong>Google Password Manager</strong> by default. You
            must change <strong>two</strong> settings so Password Manager can
            fill logins in Chrome.
          </p>

          <ol className="autofill-steps">
            <li>
              <strong>Android system</strong> — set Password Manager as the
              default autofill service.
            </li>
            <li>
              <strong>Chrome</strong> — open Chrome → <strong>Settings</strong>{" "}
              → <strong>Autofill services</strong> (or{" "}
              <strong>Passwords and autofill</strong>) → choose{" "}
              <strong>Autofill using another service</strong> (wording may vary).
            </li>
            <li>
              Restart Chrome, unlock your vault in this app, then tap a login
              field on a website.
            </li>
          </ol>

          <p className="muted small">
            If you do not see that Chrome option, update Chrome from the Play
            Store (Chrome 131+). Older versions only support Google autofill in
            the browser.
          </p>

          <p className="muted small">
            Optional: in Chrome&apos;s address bar, open{" "}
            <code>chrome://flags/#enable-autofill-virtual-view-structure</code>{" "}
            and enable it, then restart Chrome.
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
    </div>
  );
}
