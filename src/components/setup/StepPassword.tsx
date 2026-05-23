import { PasswordRequirements } from "../PasswordRequirements";

interface StepPasswordProps {
  password: string;
  setPassword: (val: string) => void;
  confirm: string;
  setConfirm: (val: string) => void;
  passwordValid: boolean;
  error: string | null;
  onNext: () => void;
  onBack: () => void;
}

export function StepPassword({
  password,
  setPassword,
  confirm,
  setConfirm,
  passwordValid,
  error,
  onNext,
  onBack,
}: StepPasswordProps) {
  return (
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
