import { useState } from "react";
import { isBiometricAvailable } from "@/shared/biometrics";
import type { PersonCategoryId } from "@/shared/types";
import { pullVaultFromPc } from "@/shared/lanSync";
import { LanSyncModal } from "../LanSyncModal";
import { validateMasterPassword } from "@/shared/passwordPolicy";
import { StepPeople } from "./StepPeople";
import { StepPassword } from "./StepPassword";
import { StepBiometric } from "./StepBiometric";
import { StepMpin } from "./StepMpin";
import { StepLanSyncPassword } from "./StepLanSyncPassword";

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

const STEPS = ["people", "password", "biometric", "mpin", "lan-sync-password"] as const;
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
          <StepPeople
            people={people}
            setPeople={setPeople}
            nameInput={nameInput}
            setNameInput={setNameInput}
            nameCategory={nameCategory}
            setNameCategory={setNameCategory}
            addPerson={addPerson}
            busy={busy}
            onNext={() => setStep("password")}
            onLanSyncOpen={() => setLanSyncOpen(true)}
            onRestoreBackup={onRestoreBackup}
          />
        )}

        {step === "password" && (
          <StepPassword
            password={password}
            setPassword={setPassword}
            confirm={confirm}
            setConfirm={setConfirm}
            passwordValid={passwordValid}
            error={error}
            onNext={() => void goBiometricCheck()}
            onBack={() => setStep("people")}
          />
        )}

        {step === "biometric" && (
          <StepBiometric
            bioAvailable={bioAvailable}
            enableBiometrics={enableBiometrics}
            setEnableBiometrics={setEnableBiometrics}
            onNext={() => setStep("mpin")}
            onBack={() => setStep("password")}
          />
        )}

        {step === "mpin" && (
          <StepMpin
            mpin={mpin}
            setMpin={setMpin}
            error={error}
            busy={busy}
            onComplete={() => void startFinish()}
            onBack={() => setStep("biometric")}
          />
        )}
        {step === "lan-sync-password" && (
          <StepLanSyncPassword
            lanSyncPw={lanSyncPw}
            setLanSyncPw={setLanSyncPw}
            error={error}
            busy={busy}
            downloadedVault={downloadedVault}
            onRestoreBackup={onRestoreBackup}
            onCancel={() => {
              setDownloadedVault(null);
              setStep("people");
            }}
          />
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
