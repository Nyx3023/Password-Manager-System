import { useState } from "react";
import { isBiometricAvailable } from "@/shared/biometrics";
import { PERSON_CATEGORIES } from "@/shared/people";
import type { PersonCategoryId } from "@/shared/types";
import { MpinConfirmFlow } from "../MpinConfirmFlow";
import { PasswordRequirements } from "../PasswordRequirements";
import { RestoreBackup } from "../RestoreBackup";
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
  busy: boolean;
  error: string | null;
  onComplete: (data: SetupData) => Promise<boolean>;
  onRestoreBackup: (content: string, password: string) => Promise<boolean>;
}

const STEPS = ["people", "password", "biometric", "mpin"] as const;
type Step = (typeof STEPS)[number];

export function SetupWizard({
  busy,
  error,
  onComplete,
  onRestoreBackup,
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
    const data: SetupData = {
      people,
      password,
      enableBiometrics: bioAvailable && enableBiometrics,
      mpin,
    };

    await onComplete(data);
  };

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
      </main>
    </div>
  );
}
