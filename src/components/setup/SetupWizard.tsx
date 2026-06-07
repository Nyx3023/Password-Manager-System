import { useState } from "react";
import { isBiometricAvailable } from "@/shared/biometrics";
import { PERSON_CATEGORIES } from "@/shared/people";
import type { PersonCategoryId } from "@/shared/types";
import { MpinConfirmFlow } from "../MpinConfirmFlow";
import { PasswordRequirements } from "../PasswordRequirements";
import { RestoreBackup } from "../RestoreBackup";
import { pullVaultFromPc } from "@/shared/lanSync";
import { LanSyncModal } from "../LanSyncModal";
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

const STEPS = ["people", "password", "biometric", "mpin", "lan-sync-password"] as const;
type Step = (typeof STEPS)[number];

export function SetupWizard({
  layout = "mobile",
  busy,
  error,
  onComplete,
  onRestoreBackup,
  onVerifyBackup,
  onCompleteImport,
}: SetupWizardProps) {
  const [step, setStep] = useState<Step>("people");
  const [people, setPeople] = useState<SetupPerson[]>([]);
  const [nameInput, setNameInput] = useState("");
  const [nameCategory, setNameCategory] = useState<PersonCategoryId>("self");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [bioAvailable, setBioAvailable] = useState(false);
  const [enableBiometrics, setEnableBiometrics] = useState(false);

  const [mpin, setMpin] = useState("");

  const [lanSyncOpen, setLanSyncOpen] = useState(false);
  const [downloadedVault, setDownloadedVault] = useState<string | null>(null);
  const [lanSyncPw, setLanSyncPw] = useState("");

  const passwordValid = validateMasterPassword(password).valid;

  const stepIndex = STEPS.indexOf(step);

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
      await onCompleteImport(downloadedVault, lanSyncPw, bioAvailable && enableBiometrics, mpin);
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

  const handleLanPull = async (host: string, port: number) => {
    try {
      const { content } = await pullVaultFromPc({ host, port });
      setDownloadedVault(content);
      setLanSyncOpen(false);
      setStep("lan-sync-password");
      return { ok: true, message: "Vault downloaded." };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Download failed." };
    }
  };

  if (layout === "desktop") {
    return (
      <div className="setup-desktop-split">
        {/* Left Column / Stepper Pane */}
        <div className="setup-left-pane">
          <div className="left-pane-header">
            <div className="vault-logo-badge" style={{ fontSize: "2.5rem", marginBottom: "8px" }}>🔐</div>
            <p className="setup-brand" style={{ fontWeight: "bold", margin: "8px 0" }}>PASSWORD MANAGER</p>
            <div className="dot-matrix small" aria-hidden style={{ margin: "8px 0", display: "grid", gridTemplateColumns: "repeat(6, 5px)", gap: "5px" }}>
              {Array.from({ length: 12 }).map((_, i) => (
                <span key={i} className={i % 5 === 0 ? "dot dot--accent" : "dot"} />
              ))}
            </div>
          </div>

          <div className="setup-stepper">
            {STEPS.map((s, idx) => {
              let label = "";
              if (s === "people") label = "Vault Users";
              else if (s === "password") label = "Master Password";
              else if (s === "biometric") label = "Biometric Unlock";
              else if (s === "mpin") label = "8-Digit MPIN";
              else if (s === "lan-sync-password") label = "Unlock Sync";

              const isCurrent = step === s;
              const isCompleted = idx < stepIndex;

              return (
                <div
                  key={s}
                  className={`setup-stepper-step ${isCurrent ? "active" : ""} ${
                    isCompleted ? "completed" : ""
                  }`}
                >
                  <span className="step-number">{isCompleted ? "✓" : idx + 1}</span>
                  <span className="step-label">{label}</span>
                </div>
              );
            })}
          </div>

          <p
            className="setup-sub center-text"
            style={{
              fontSize: "10px",
              opacity: 0.5,
              marginTop: "auto",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 0,
            }}
          >
            Secure Offline Vault
          </p>
        </div>

        {/* Right Column / Step Content Pane */}
        <div className="setup-right-pane">
          {step === "people" && (
            <>
              <h1 className="setup-title">Who uses this vault?</h1>
              <p className="setup-sub">
                Add everyone you want to save passwords for: family, friends, work, yourself.
              </p>

              <div className="setup-card stack">
                <label>
                  Name
                  <input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="e.g. Me, Mom, John"
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
                onClick={() => setLanSyncOpen(true)}
              >
                Setup from existing device (LAN)
              </button>
              <RestoreBackup busy={busy} onRestore={onRestoreBackup} />
            </>
          )}

          {step === "password" && (
            <>
              <h1 className="setup-title">Master password</h1>
              <p className="setup-sub">
                This encrypts your vault. If you forget it, data cannot be recovered.
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
                disabled={
                  !passwordValid ||
                  !confirm ||
                  password !== confirm
                }
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
                Uses your phone&apos;s <strong>existing</strong> fingerprint or face unlock, the
                same enrollment as your lock screen. Nothing is copied into this app.
              </p>
              {!bioAvailable ? (
                <p className="muted small">
                  Biometrics not available on this device. Use MPIN or master password instead.
                </p>
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
                Required to open the app, like GCash. Use this every time you unlock. Biometrics
                are optional on top.
              </p>
              <MpinConfirmFlow onComplete={(code) => setMpin(code)} />
              {mpin.length === 8 && <p className="muted small center-text">MPIN set</p>}
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

          {step === "lan-sync-password" && (
            <>
              <h1 className="setup-title">Unlock Downloaded Vault</h1>
              <p className="setup-sub">
                Vault downloaded successfully. Enter the master password to unlock it.
              </p>
              <div className="setup-card stack">
                <label>
                  Master password
                  <input
                    type="password"
                    value={lanSyncPw}
                    onChange={(e) => setLanSyncPw(e.target.value)}
                    autoFocus
                  />
                </label>
              </div>
              {error && <p className="error">{error}</p>}
              <button
                type="button"
                className="primary block"
                disabled={busy || !lanSyncPw}
                onClick={async () => {
                  const ok = await onVerifyBackup(downloadedVault!, lanSyncPw);
                  if (ok) {
                    void goBiometricCheck();
                  }
                }}
              >
                {busy ? "Verifying..." : "Verify & Continue"}
              </button>
              <button
                type="button"
                className="ghost block"
                disabled={busy}
                onClick={() => {
                  setDownloadedVault(null);
                  setLanSyncPw("");
                  setStep("people");
                }}
              >
                Cancel
              </button>
            </>
          )}
        </div>

        <LanSyncModal
          open={lanSyncOpen}
          busy={busy}
          onClose={() => setLanSyncOpen(false)}
          onPull={handleLanPull}
          onPush={async () => ({ ok: false, message: "Push not available during setup." })}
          onMessage={() => {}}
        />
      </div>
    );
  }

  return (
    <div className="setup-wizard screen">
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

      <main className="setup-body">
        {step === "people" && (
          <>
            <h1 className="setup-title">Who uses this vault?</h1>
            <p className="setup-sub">
              Add everyone you want to save passwords for: family, friends,
              work, yourself.
            </p>

            <div className="setup-card stack">
              <label>
                Name
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="e.g. Me, Mom, John"
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
              onClick={() => setLanSyncOpen(true)}
            >
              Setup from existing device (LAN)
            </button>
            <RestoreBackup busy={busy} onRestore={onRestoreBackup} />
          </>
        )}

        {step === "password" && (
          <>
            <h1 className="setup-title">Master password</h1>
            <p className="setup-sub">
              This encrypts your vault. If you forget it, data cannot be recovered.
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
              disabled={
                !passwordValid ||
                !confirm ||
                password !== confirm
              }
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
              Uses your phone&apos;s <strong>existing</strong> fingerprint or face
              unlock, the same enrollment as your lock screen. Nothing is copied
              into this app.
            </p>
            {!bioAvailable ? (
              <p className="muted small">
                Biometrics not available on this device. Use MPIN or master
                password instead.
              </p>
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
              Required to open the app, like GCash. Use this every time you
              unlock. Biometrics are optional on top.
            </p>
            <MpinConfirmFlow onComplete={(code) => setMpin(code)} />
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
        {step === "lan-sync-password" && (
          <>
            <h1 className="setup-title">Unlock Downloaded Vault</h1>
            <p className="setup-sub">
              Vault downloaded successfully. Enter the master password to unlock it.
            </p>
            <div className="setup-card stack">
              <label>
                Master password
                <input
                  type="password"
                  value={lanSyncPw}
                  onChange={(e) => setLanSyncPw(e.target.value)}
                  autoFocus
                />
              </label>
            </div>
            {error && <p className="error">{error}</p>}
            <button
              type="button"
              className="primary block"
              disabled={busy || !lanSyncPw}
              onClick={async () => {
                const ok = await onVerifyBackup(downloadedVault!, lanSyncPw);
                if (ok) {
                  void goBiometricCheck();
                }
              }}
            >
              {busy ? "Verifying..." : "Verify & Continue"}
            </button>
            <button
              type="button"
              className="ghost block"
              disabled={busy}
              onClick={() => {
                setDownloadedVault(null);
                setLanSyncPw("");
                setStep("people");
              }}
            >
              Cancel
            </button>
          </>
        )}
      </main>

      <LanSyncModal
        open={lanSyncOpen}
        busy={busy}
        onClose={() => setLanSyncOpen(false)}
        onPull={handleLanPull}
        onPush={async () => ({ ok: false, message: "Push not available during setup." })}
        onMessage={() => {}}
      />
    </div>
  );
}
