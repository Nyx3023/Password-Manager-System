import { useState, useCallback, useEffect } from "react";
import { isBiometricAvailable } from "@/shared/biometrics";
import { PERSON_CATEGORIES } from "@/shared/people";
import type { PersonCategoryId } from "@/shared/types";
import { useBackHandler } from "@/shared/backButton";
import { MpinConfirmFlow } from "../MpinConfirmFlow";
import { PasswordRequirements } from "../PasswordRequirements";
import { LoadingIndicator } from "../LoadingIndicator";
import { pickVaultImportFile } from "@/shared/transfer";
import { validateMasterPassword } from "@/shared/passwordPolicy";
import { listCachedAccounts, type CachedAccount } from "@/shared/accountVaults";

export interface SetupPerson {
  name: string;
  category: PersonCategoryId;
}

export interface SetupData {
  people: SetupPerson[];
  password: string;
  enableBiometrics: boolean;
  mpin: string;
  /** When true, the vault was created via Google sign-in and should auto-sync to cloud. */
  cloudMode?: boolean;
  ownerUid?: string;
  ownerEmail?: string;
}

interface SetupWizardProps {
  layout?: "mobile" | "desktop";
  busy: boolean;
  error: string | null;
  onComplete: (data: SetupData) => Promise<boolean>;
  onRestoreBackup: (content: string, password: string) => Promise<boolean>;
  onVerifyBackup: (content: string, password: string) => Promise<boolean>;
  onCompleteImport?: (
    content: string,
    password: string,
    enableBiometrics: boolean,
    mpin: string,
  ) => Promise<boolean>;
  /** Sign in with Google and check if a cloud vault exists for that account. */
  onGoogleSignIn?: () => Promise<{ uid?: string; email: string; vaultContent: string | null }>;
  onSwitchCachedAccount?: (uid: string) => Promise<boolean>;
}

type Step =
  | "choose-path"
  | "google-checking"
  | "google-found"
  | "google-not-found"
  | "people"
  | "password"
  | "biometric"
  | "mpin"
  | "pms-restore-password";

type SetupMode = "offline" | "google-create" | "google-restore" | "pms";

/** Google "G" logo SVG */
const GoogleIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
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

export function SetupWizard({
  layout,
  busy,
  error,
  onComplete,
  onRestoreBackup,
  onVerifyBackup,
  onCompleteImport,
  onGoogleSignIn,
  onSwitchCachedAccount,
}: SetupWizardProps) {
  const isDesktop = layout === "desktop" || Boolean(window.electronAPI);

  // ── Navigation state ──
  const [step, setStep] = useState<Step>("choose-path");
  const [mode, setMode] = useState<SetupMode>("offline");
  const [cachedAccounts, setCachedAccounts] = useState<CachedAccount[]>([]);

  useEffect(() => {
    void listCachedAccounts().then(setCachedAccounts);
  }, []);

  // ── People step ──
  const [people, setPeople] = useState<SetupPerson[]>([]);
  const [nameInput, setNameInput] = useState("");
  const [nameCategory, setNameCategory] = useState<PersonCategoryId>("self");

  // ── Password step ──
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // ── Biometric step ──
  const [bioAvailable, setBioAvailable] = useState(false);
  const [enableBiometrics, setEnableBiometrics] = useState(false);

  // ── MPIN step ──
  const [mpin, setMpin] = useState("");

  // ── Google / restore state ──
  const [googleEmail, setGoogleEmail] = useState("");
  const [googleUid, setGoogleUid] = useState("");
  const [downloadedVault, setDownloadedVault] = useState<string | null>(null);
  const [restorePassword, setRestorePassword] = useState("");
  const [googleError, setGoogleError] = useState<string | null>(null);

  const passwordValid = validateMasterPassword(password).valid;

  // ── Back button ──
  useBackHandler(() => {
    if (step === "google-checking") return false; // can't cancel mid-auth
    if (step === "google-found" || step === "google-not-found") {
      resetToChoosePath();
      return true;
    }
    if (step === "pms-restore-password") {
      resetToChoosePath();
      return true;
    }
    if (step === "mpin") {
      setStep("biometric");
      return true;
    }
    if (step === "biometric") {
      if (mode === "google-restore" || mode === "pms") {
        // For restore flows, biometric is right after password verification
        setStep(mode === "google-restore" ? "google-found" : "pms-restore-password");
      } else {
        setStep("password");
      }
      return true;
    }
    if (step === "password") {
      setStep("people");
      return true;
    }
    if (step === "people") {
      resetToChoosePath();
      return true;
    }
    return false;
  }, true);

  // ── Helpers ──
  const resetToChoosePath = useCallback(() => {
    setStep("choose-path");
    setMode("offline");
    setGoogleEmail("");
    setGoogleUid("");
    setDownloadedVault(null);
    setRestorePassword("");
    setGoogleError(null);
  }, []);

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

  // ── Path handlers ──
  const handleGooglePath = async () => {
    if (!onGoogleSignIn) return;
    setGoogleError(null);
    setStep("google-checking");

    try {
      const result = await onGoogleSignIn();
      setGoogleEmail(result.email);
      if (result.uid) setGoogleUid(result.uid);

      if (result.vaultContent) {
        setDownloadedVault(result.vaultContent);
        setMode("google-restore");
        setStep("google-found");
      } else {
        setMode("google-create");
        setStep("google-not-found");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Google sign-in failed.";
      setGoogleError(msg);
      setStep("choose-path");
    }
  };

  const handleOfflinePath = () => {
    setMode("offline");
    setStep("people");
  };

  const handlePmsPath = async () => {
    try {
      const content = await pickVaultImportFile();
      if (!content) return;
      setDownloadedVault(content);
      setMode("pms");
      setStep("pms-restore-password");
    } catch (e) {
      if (
        e instanceof Error &&
        (e.message.includes("No file selected") ||
          e.message.includes("canceled") ||
          e.message.includes("cancelled"))
      ) {
        return;
      }
      setGoogleError(e instanceof Error ? e.message : "Failed to read backup file.");
    }
  };

  // ── Finish handler ──
  const startFinish = async () => {
    if (mode === "google-restore" && downloadedVault) {
      if (onCompleteImport) {
        await onCompleteImport(
          downloadedVault,
          restorePassword,
          bioAvailable && enableBiometrics,
          mpin,
        );
      } else {
        await onRestoreBackup(downloadedVault, restorePassword);
      }
      return;
    }

    if (mode === "pms" && downloadedVault) {
      if (onCompleteImport) {
        await onCompleteImport(
          downloadedVault,
          restorePassword,
          bioAvailable && enableBiometrics,
          mpin,
        );
      } else {
        await onRestoreBackup(downloadedVault, restorePassword);
      }
      return;
    }

    const data: SetupData = {
      people,
      password,
      enableBiometrics: bioAvailable && enableBiometrics,
      mpin,
      cloudMode: mode === "google-create",
      ownerUid: mode === "google-create" ? googleUid : undefined,
      ownerEmail: mode === "google-create" ? googleEmail : undefined,
    };
    await onComplete(data);
  };

  // ── Step progress for creation flows ──
  const creationSteps = ["people", "password", "biometric", "mpin"] as const;
  const restoreSteps = ["biometric", "mpin"] as const;

  const getProgressSteps = () => {
    if (mode === "google-restore" || mode === "pms") return restoreSteps;
    return creationSteps;
  };

  const getProgressIndex = () => {
    const steps = getProgressSteps();
    return steps.indexOf(step as any);
  };

  const showProgress =
    step === "people" ||
    step === "password" ||
    step === "biometric" ||
    step === "mpin";

  // ── Render: Choose Path (Welcome Screen) ──
  const renderChoosePath = () => (
    <main className="setup-body">
      <div className="setup-welcome-icon">🔐</div>
      <h1 className="setup-title" style={{ textAlign: "center", margin: "2px 0 4px", fontSize: "1.35rem" }}>
        SecureX Vault
      </h1>
      <p className="setup-sub" style={{ textAlign: "center", margin: "0 0 10px", fontSize: "0.8rem", lineHeight: 1.35 }}>
        Zero-knowledge encrypted password manager.
        <br />
        Your data never leaves your device unencrypted.
      </p>

      {googleError && <div className="callout callout--danger">{googleError}</div>}
      {error && <div className="callout callout--danger">{error}</div>}

      <div className="setup-paths">
        {cachedAccounts.length > 0 && onSwitchCachedAccount && (
          <div style={{ width: "100%", marginBottom: "10px" }}>
            <p style={{ fontSize: "0.72rem", color: "var(--color-muted, #888)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
              Saved Vaults on this Device
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {cachedAccounts.map((acc) => (
                <button
                  key={acc.uid}
                  type="button"
                  className="setup-path-btn"
                  style={{ padding: "8px 12px", border: "1px solid var(--border-color, rgba(255,255,255,0.15))" }}
                  disabled={busy}
                  onClick={() => void onSwitchCachedAccount(acc.uid)}
                >
                  <div className="setup-path-icon" style={{ fontSize: "1.1rem" }}>
                    {acc.uid === "offline" ? "🛡️" : "👤"}
                  </div>
                  <div className="setup-path-text" style={{ textAlign: "left" }}>
                    <span className="setup-path-label" style={{ fontSize: "0.85rem" }}>{acc.email || acc.uid}</span>
                    <span className="setup-path-hint" style={{ fontSize: "0.72rem" }}>
                      Switch to this vault
                    </span>
                  </div>
                </button>
              ))}
            </div>
            <div className="setup-path-divider" style={{ margin: "10px 0" }}>
              <span>or set up another</span>
            </div>
          </div>
        )}

        {/* Google Account path */}
        {onGoogleSignIn && (
          <button
            type="button"
            className="setup-path-btn setup-path-btn--google"
            disabled={busy}
            onClick={() => void handleGooglePath()}
          >
            <div className="setup-path-icon">
              <GoogleIcon size={22} />
            </div>
            <div className="setup-path-text">
              <span className="setup-path-label">Continue with Google</span>
              <span className="setup-path-hint">
                Sign in to restore an existing vault or create a new cloud-synced vault
              </span>
            </div>
          </button>
        )}

        <div className="setup-path-divider" style={{ margin: "6px 0" }}>
          <span>or</span>
        </div>

        {/* Offline vault path */}
        <button
          type="button"
          className="setup-path-btn setup-path-btn--offline"
          disabled={busy}
          onClick={handleOfflinePath}
        >
          <div className="setup-path-icon">🛡️</div>
          <div className="setup-path-text">
            <span className="setup-path-label">Create Offline Vault</span>
            <span className="setup-path-hint">
              100% device-local. Can be synced to Google later
            </span>
          </div>
        </button>

        {/* .pms restore path */}
        <button
          type="button"
          className="setup-path-btn setup-path-btn--pms"
          disabled={busy}
          onClick={() => void handlePmsPath()}
        >
          <div className="setup-path-icon">📁</div>
          <div className="setup-path-text">
            <span className="setup-path-label">Restore from Backup File</span>
            <span className="setup-path-hint">
              Import an encrypted .pms backup from another device
            </span>
          </div>
        </button>
      </div>
    </main>
  );

  // ── Render: Google Checking ──
  const renderGoogleChecking = () => (
    <main className="setup-body" style={{ justifyContent: "center", alignItems: "center" }}>
      <LoadingIndicator label="Signing in with Google…" />
    </main>
  );

  // ── Render: Google Found (vault exists) ──
  const renderGoogleFound = () => (
    <main className="setup-body">
      <div className="setup-welcome-icon" style={{ fontSize: "2.2rem" }}>☁️</div>
      <h1 className="setup-title" style={{ textAlign: "center" }}>
        Cloud Vault Found
      </h1>
      <p className="setup-sub" style={{ textAlign: "center" }}>
        Signed in as <strong>{googleEmail}</strong>. Enter your Master Password to decrypt and restore your vault on this device.
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
        {busy ? "Decrypting…" : "Verify & Continue"}
      </button>

      <button
        type="button"
        className="ghost block"
        disabled={busy}
        onClick={resetToChoosePath}
      >
        Back
      </button>
    </main>
  );

  // ── Render: Google Not Found (no vault, create new) ──
  const renderGoogleNotFound = () => (
    <main className="setup-body">
      <div className="setup-welcome-icon" style={{ fontSize: "2.2rem" }}>📭</div>
      <h1 className="setup-title" style={{ textAlign: "center" }}>
        No Cloud Vault Found
      </h1>
      <p className="setup-sub" style={{ textAlign: "center" }}>
        No existing vault was found for <strong>{googleEmail}</strong>.
        Let&apos;s create a new encrypted vault that will automatically sync to your Google Account.
      </p>

      <button
        type="button"
        className="primary block"
        onClick={() => setStep("people")}
      >
        Create Cloud Vault
      </button>

      <button
        type="button"
        className="ghost block"
        onClick={resetToChoosePath}
      >
        Back
      </button>
    </main>
  );

  // ── Render: People ──
  const renderPeople = () => (
    <main className="setup-body">
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
        className="ghost block"
        onClick={() => {
          if (mode === "google-create") {
            setStep("google-not-found");
          } else {
            resetToChoosePath();
          }
        }}
      >
        Back
      </button>
    </main>
  );

  // ── Render: Password ──
  const renderPassword = () => (
    <main className="setup-body">
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
    </main>
  );

  // ── Render: Biometric ──
  const renderBiometric = () => (
    <main className="setup-body">
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
        onClick={() => {
          if (mode === "google-restore") {
            setStep("google-found");
          } else if (mode === "pms") {
            setStep("pms-restore-password");
          } else {
            setStep("password");
          }
        }}
      >
        Back
      </button>
    </main>
  );

  // ── Render: MPIN ──
  const renderMpin = () => (
    <main className="setup-body">
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
    </main>
  );

  // ── Render: PMS Restore Password ──
  const renderPmsRestorePassword = () => (
    <main className="setup-body">
      <h1 className="setup-title">Unlock Backup</h1>
      <p className="setup-sub">
        Enter the Master Password for the backup you selected to decrypt and restore it.
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
        {busy ? "Decrypting…" : "Verify & Continue"}
      </button>
      <button
        type="button"
        className="ghost block"
        disabled={busy}
        onClick={resetToChoosePath}
      >
        Back
      </button>
    </main>
  );

  // ── Select renderer ──
  const renderCurrentStep = () => {
    switch (step) {
      case "choose-path":
        return renderChoosePath();
      case "google-checking":
        return renderGoogleChecking();
      case "google-found":
        return renderGoogleFound();
      case "google-not-found":
        return renderGoogleNotFound();
      case "people":
        return renderPeople();
      case "password":
        return renderPassword();
      case "biometric":
        return renderBiometric();
      case "mpin":
        return renderMpin();
      case "pms-restore-password":
        return renderPmsRestorePassword();
    }
  };

  // ── Desktop sidebar timeline ──
  const renderDesktopTimeline = () => {
    if (step === "choose-path" || step === "google-checking") return null;

    if (mode === "google-restore" || mode === "pms") {
      const restoreLabel = mode === "google-restore" ? "Cloud Restore" : "File Restore";
      return (
        <nav className="setup-desktop-timeline">
          <div className={`timeline-item${step === "google-found" || step === "pms-restore-password" ? " active" : (step === "biometric" || step === "mpin") ? " done" : ""}`}>
            <div className="timeline-node">1</div>
            <div className="timeline-content">
              <span className="timeline-title">{restoreLabel}</span>
              <span className="timeline-sub">Decrypt vault backup</span>
            </div>
          </div>
          <div className={`timeline-item${step === "biometric" ? " active" : step === "mpin" ? " done" : ""}`}>
            <div className="timeline-node">2</div>
            <div className="timeline-content">
              <span className="timeline-title">Biometrics</span>
              <span className="timeline-sub">Quick hardware unlock</span>
            </div>
          </div>
          <div className={`timeline-item${step === "mpin" ? " active" : ""}`}>
            <div className="timeline-node">3</div>
            <div className="timeline-content">
              <span className="timeline-title">Quick MPIN</span>
              <span className="timeline-sub">8-digit keyboard unlock</span>
            </div>
          </div>
        </nav>
      );
    }

    // Creation flow (offline or google-create)
    return (
      <nav className="setup-desktop-timeline">
        {step === "google-not-found" && (
          <div className="timeline-item active">
            <div className="timeline-node">☁️</div>
            <div className="timeline-content">
              <span className="timeline-title">New Cloud Vault</span>
              <span className="timeline-sub">{googleEmail}</span>
            </div>
          </div>
        )}
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
        <div className={`timeline-item${step === "biometric" ? " active" : (step === "mpin") ? " done" : ""}`}>
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
      </nav>
    );
  };

  // ── Main render ──
  return (
    <div className={`setup-wizard screen${isDesktop ? " setup-wizard--desktop" : ""}`}>
      {isDesktop ? (
        <div className="setup-desktop-container">
          <aside className="setup-desktop-sidebar">
            <div className="setup-desktop-brand-box">
              <div className="vault-logo-badge small">🔐</div>
              <h2 className="setup-brand">SECUREX VAULT</h2>
              <p className="setup-desktop-tagline">Zero-Knowledge Password Manager</p>
            </div>

            {renderDesktopTimeline()}

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

          <div className="setup-desktop-main">
            {renderCurrentStep()}
          </div>
        </div>
      ) : (
        <>
          {step !== "choose-path" && step !== "google-checking" && (
            <header className={`setup-header${step === "google-found" || step === "google-not-found" ? " compact" : ""}`}>
              <p className="setup-brand">
                {mode === "google-create" ? "SECUREX CLOUD VAULT" : mode === "google-restore" ? "SECUREX CLOUD RESTORE" : "SECUREX VAULT"}
              </p>
              {showProgress && (
                <div className="setup-steps">
                  {getProgressSteps().map((s, i) => (
                    <span
                      key={s}
                      className={`setup-step-dot${i <= getProgressIndex() ? " on" : ""}`}
                    />
                  ))}
                </div>
              )}
            </header>
          )}

          {renderCurrentStep()}
        </>
      )}
    </div>
  );
}
