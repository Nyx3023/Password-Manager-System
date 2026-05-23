interface StepBiometricProps {
  bioAvailable: boolean;
  enableBiometrics: boolean;
  setEnableBiometrics: (val: boolean) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepBiometric({
  bioAvailable,
  enableBiometrics,
  setEnableBiometrics,
  onNext,
  onBack,
}: StepBiometricProps) {
  return (
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
        onClick={onNext}
      >
        Continue
      </button>
      <button
        type="button"
        className="ghost block"
        onClick={onBack}
      >
        Back
      </button>
    </>
  );
}
