import { useState } from "react";
import { isBiometricAvailable } from "@/shared/biometrics";
import { PERSON_CATEGORIES } from "@/shared/people";
import type { PersonCategoryId } from "@/shared/types";
import { useBackHandler } from "@/shared/backButton";
import { MpinConfirmFlow } from "../MpinConfirmFlow";
import { PasswordRequirements } from "../PasswordRequirements";
import { RestoreBackup } from "../RestoreBackup";
import { GoogleDriveRestoreModal } from "./GoogleDriveRestoreModal";
import { validateMasterPassword } from "@/shared/passwordPolicy";

export interface SetupPerson {
  name: string;
  category: PersonCategoryId;
}

export interface SetupData {
  people: SetupPerson[];
  password: string;
  enableBiometrics: boolean;
  mpin: string;
}

interface SetupWizardProps {
  layout?: "mobile" | "desktop";
  busy: boolean;
  error: string | null;
  onComplete: (data: SetupData) => Promise<boolean>;
  onRestoreBackup: (content: string, password: string) => Promise<boolean>;
  onVerifyBackup: (content: string, password: string) => Promise<boolean>;
  onCompleteImport?: (content: string, password: string, enableBiometrics: boolean, mpin: string) => Promise<boolean>;
}

const STEPS = ["people", "password", "biometric", "mpin", "google-drive-restore-password"] as const;
type Step = (typeof STEPS)[number];

export function SetupWizard({
  layout,
  busy,
  error,
  onComplete,
  onRestoreBackup,
  onVerifyBackup,
  onCompleteImport,
}: SetupWizardProps) {
  const isDesktop = layout === "desktop" || Boolean(window.electronAPI);
  const [step, setStep] = useState<Step>("people");
  const [people, setPeople] = useState<SetupPerson[]>([]);
  const [nameInput, setNameInput] = useState("");
  const [nameCategory, setNameCategory] = useState<PersonCategoryId>("self");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [bioAvailable, setBioAvailable] = useState(false);
  const [enableBiometrics, setEnableBiometrics] = useState(false);

  const [mpin, setMpin] = useState("");

  const [googleDriveModalOpen, setGoogleDriveModalOpen] = useState(false);
  const [downloadedVault, setDownloadedVault] = useState<string | null>(null);
  const [restoreUserEmail, setRestoreUserEmail] = useState("");
  const [restorePassword, setRestorePassword] = useState("");

  const passwordValid = validateMasterPassword(password).valid;
  const stepIndex = STEPS.indexOf(step);

  // Hardware Back Button integration
  useBackHandler(() => {
    if (googleDriveModalOpen) {
      setGoogleDriveModalOpen(false);
      return true;
    }
    if (step === "google-drive-restore-password") {
      setDownloadedVault(null);
      setRestorePassword("");
      setStep("people");
      return true;
    }
    if (step === "mpin") {
      setStep("biometric");
      return true;
    }
    if (step === "biometric") {
      setStep("password");
      return true;
    }
    if (step === "password") {
      setStep("people");
      return true;
    }
    return false;
  }, true);

  const addPerson = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setPeople((p) => [...p, { name: trimmed, category: nameCategory }]);
    setNameInput("");
  };

  const goBiometricCheck = async () => {
    const avail = await isBiometricAvailable();
    setBioAvailable(avail);
    if (!avail) setEnableBiometrics(false);
    setStep("biometric");
  };

  const startFinish = async () => {
    if (downloadedVault && onCompleteImport) {
      await onCompleteImport(downloadedVault, restorePassword, bioAvailable && enableBiometrics, mpin);
      return;
    }

    const data: SetupData = {
      people,
      password,
      enableBiometrics: bioAvailable && enableBiometrics,
      mpin,
    };

    await onComplete(data);
  };

  const handleVaultDownloaded = (vaultJson: string, email: string) => {
    setDownloadedVault(vaultJson);
    setRestoreUserEmail(email);
    setStep("google-drive-restore-password");
  };

  // Render the interactive step forms
  const renderStepContent = () => (
    <main className="setup-body">
      {step === "people" && (
        <>
          <h1 className="setup-title">Who uses this vault?</h1>
          <p className="setup-sub">
            Add profiles for everyone who will have credentials in this vault: self, family, or work.
          </p>

          <div className="setup-card stack">
            <label>
              Name
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="e.g. Me, Mom, Work"
                onKeyDown={(e) => e.key === "Enter" && addPerson()}
              />
            </label>
            <div className="category-pill-row">
              {PERSON_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`pill${nameCategory === cat.id ? " active" : ""}`}
                  onClick={() => setNameCategory(cat.id)}
                >
                  {cat.name}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="ghost block"
              onClick={addPerson}
              disabled={!nameInput.trim()}
            >
              + Add to list
            </button>
          </div>

          {people.length > 0 && (
            <ul className="setup-people-list">
              {people.map((p, i) => (
                <li key={`${p.name}-${i}`}>
                  <span>{p.name}</span>
                  <span className="muted small">
                    {PERSON_CATEGORIES.find((c) => c.id === p.category)?.name}
                  </span>
                  <button
                    type="button"
                    className="ghost small"
                    onClick={() =>
                      setPeople((list) => list.filter((_, j) => j !== i))
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className="primary block"
            disabled={people.length === 0}
            onClick={() => setStep("password")}
          >
            Continue
          </button>
          <button
            type="button"
            className="ghost restore-link"
            disabled={busy}
            onClick={() => setGoogleDriveModalOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
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
            <span>Restore from Google Drive</span>
          </button>
          <RestoreBackup busy={busy} onRestore={onRestoreBackup} />
        </>
      )}

      {step === "password" && (
        <>
          <h1 className="setup-title">Master password</h1>
          <p className="setup-sub">
            This derives your zero-knowledge encryption key. If lost, your data cannot be recovered.
          </p>
          <div className="setup-card stack">
            <label>
              Master password
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <PasswordRequirements password={password} />
            <label>
              Re-enter master password
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
          </div>
          {password && confirm && password !== confirm && (
            <p className="error">Passwords do not match.</p>
          )}
          {error && <p className="error">{error}</p>}
          <button
            type="button"
            className="primary block"
            disabled={!passwordValid || !confirm || password !== confirm}
            onClick={() => void goBiometricCheck()}
          >
            Continue
          </button>
          <button
            type="button"
            className="ghost block"
            onClick={() => setStep("people")}
          >
            Back
          </button>
        </>
      )}

      {step === "biometric" && (
        <>
          <h1 className="setup-title">Biometric unlock</h1>
          <p className="setup-sub">
            Uses your phone&apos;s or computer&apos;s existing biometric hardware (fingerprint or face unlock).
          </p>
          {!bioAvailable ? (
            <div className="setup-card stack">
              <p className="muted small">
                Biometrics not detected on this system. You will unlock with your MPIN or master password.
              </p>
            </div>
          ) : (
            <div className="setup-card stack">
              <button
                type="button"
                className={`bio-choice${enableBiometrics ? " active" : ""}`}
                onClick={() => setEnableBiometrics(true)}
              >
                <span className="bio-choice-icon">👆</span>
                <span>Enable fingerprint / face unlock</span>
              </button>
              <button
                type="button"
                className={`bio-choice${!enableBiometrics ? " active" : ""}`}
                onClick={() => setEnableBiometrics(false)}
              >
                Skip for now
              </button>
            </div>
          )}
          <button
            type="button"
            className="primary block"
            onClick={() => setStep("mpin")}
          >
            Continue
          </button>
          <button
            type="button"
            className="ghost block"
            onClick={() => setStep("password")}
          >
            Back
          </button>
        </>
      )}

      {step === "mpin" && (
        <>
          <h1 className="setup-title">8-digit MPIN</h1>
          <p className="setup-sub">
            {isDesktop
              ? "Type 8 digits on your keyboard to set your fast unlock PIN."
              : "Required to open the app quickly. Use this every time you unlock."}
          </p>
          <MpinConfirmFlow
            size={isDesktop ? "desktop" : "wide-mobile"}
            collapsibleKeypad={isDesktop}
            onComplete={(code) => setMpin(code)}
          />
          {mpin.length === 8 && (
            <p className="muted small center-text">MPIN set</p>
          )}
          {error && <p className="error">{error}</p>}
          <button
            type="button"
            className="primary block"
            disabled={busy || mpin.length !== 8}
            onClick={() => void startFinish()}
          >
            {busy ? "Setting up…" : "Finish setup"}
          </button>
          <button
            type="button"
            className="ghost block"
            disabled={busy}
            onClick={() => setStep("biometric")}
          >
            Back
          </button>
        </>
      )}

      {step === "google-drive-restore-password" && (
        <>
          <h1 className="setup-title">Unlock Google Drive Vault</h1>
          <p className="setup-sub">
            Vault downloaded for <strong>{restoreUserEmail}</strong>. Enter your Master Password to decrypt and restore it.
          </p>
          <div className="setup-card stack">
            <label>
              Master password
              <input
                type="password"
                value={restorePassword}
                onChange={(e) => setRestorePassword(e.target.value)}
                autoFocus
              />
            </label>
          </div>
          {error && <p className="error">{error}</p>}
          <button
            type="button"
            className="primary block"
            disabled={busy || !restorePassword}
            onClick={async () => {
              const ok = await onVerifyBackup(downloadedVault!, restorePassword);
              if (ok) {
                void goBiometricCheck();
              }
            }}
          >
            {busy ? "Decrypting..." : "Verify & Continue"}
          </button>
          <button
            type="button"
            className="ghost block"
            disabled={busy}
            onClick={() => {
              setDownloadedVault(null);
              setRestorePassword("");
              setStep("people");
            }}
          >
            Cancel
          </button>
        </>
      )}
    </main>
  );

  return (
    <div className={`setup-wizard screen${isDesktop ? " setup-wizard--desktop" : ""}`}>
      {isDesktop ? (
        <div className="setup-desktop-container">
          {/* Left Column: Sidebar with Progress & Security info */}
          <aside className="setup-desktop-sidebar">
            <div className="setup-desktop-brand-box">
              <div className="vault-logo-badge small">🔐</div>
              <h2 className="setup-brand">SECUREX VAULT</h2>
              <p className="setup-desktop-tagline">Offline Zero-Knowledge Manager</p>
            </div>

            <nav className="setup-desktop-timeline">
              <div className={`timeline-item${step === "people" ? " active" : people.length > 0 ? " done" : ""}`}>
                <div className="timeline-node">1</div>
                <div className="timeline-content">
                  <span className="timeline-title">Vault Profiles</span>
                  <span className="timeline-sub">People & categories</span>
                </div>
              </div>
              <div className={`timeline-item${step === "password" ? " active" : passwordValid ? " done" : ""}`}>
                <div className="timeline-node">2</div>
                <div className="timeline-content">
                  <span className="timeline-title">Master Password</span>
                  <span className="timeline-sub">Argon2id encryption</span>
                </div>
              </div>
              <div className={`timeline-item${step === "biometric" ? " active" : stepIndex > 2 ? " done" : ""}`}>
                <div className="timeline-node">3</div>
                <div className="timeline-content">
                  <span className="timeline-title">Biometrics</span>
                  <span className="timeline-sub">Quick hardware unlock</span>
                </div>
              </div>
              <div className={`timeline-item${step === "mpin" ? " active" : mpin.length === 8 ? " done" : ""}`}>
                <div className="timeline-node">4</div>
                <div className="timeline-content">
                  <span className="timeline-title">Quick MPIN</span>
                  <span className="timeline-sub">8-digit keyboard unlock</span>
                </div>
              </div>
              {step === "google-drive-restore-password" && (
                <div className="timeline-item active">
                  <div className="timeline-node">☁️</div>
                  <div className="timeline-content">
                    <span className="timeline-title">Cloud Vault</span>
                    <span className="timeline-sub">Decrypt from Google Drive</span>
                  </div>
                </div>
              )}
            </nav>

            <div className="setup-desktop-security-badge">
              <span className="security-badge-icon">🛡️</span>
              <div>
                <strong style={{ display: "block", fontSize: "0.8rem", color: "var(--text)" }}>Zero-Knowledge Privacy</strong>
                <span style={{ fontSize: "0.74rem", color: "var(--muted)", lineHeight: 1.35, display: "block" }}>
                  Your password never leaves this machine unencrypted. All cryptographic keys are derived locally.
                </span>
              </div>
            </div>
          </aside>

          {/* Right Column: Interactive step form */}
          <div className="setup-desktop-main">
            {renderStepContent()}
          </div>
        </div>
      ) : (
        <>
          <header className="setup-header">
            <p className="setup-brand">PASSWORD MANAGER</p>
            <div className="dot-matrix" aria-hidden>
              {Array.from({ length: 24 }).map((_, i) => (
                <span key={i} className={i % 7 === 0 ? "dot dot--accent" : "dot"} />
              ))}
            </div>
            <div className="setup-steps">
              {STEPS.map((s, i) => (
                <span
                  key={s}
                  className={`setup-step-dot${i <= stepIndex ? " on" : ""}`}
                />
              ))}
            </div>
          </header>

          {renderStepContent()}
        </>
      )}

      <GoogleDriveRestoreModal
        open={googleDriveModalOpen}
        onClose={() => setGoogleDriveModalOpen(false)}
        onVaultDownloaded={handleVaultDownloaded}
      />
    </div>
  );
}
