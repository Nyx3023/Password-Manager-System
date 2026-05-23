import { MpinConfirmFlow } from "../MpinConfirmFlow";

interface StepMpinProps {
  mpin: string;
  setMpin: (val: string) => void;
  error: string | null;
  busy: boolean;
  onComplete: () => void;
  onBack: () => void;
}

export function StepMpin({
  mpin,
  setMpin,
  error,
  busy,
  onComplete,
  onBack,
}: StepMpinProps) {
  return (
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
        onClick={onComplete}
      >
        {busy ? "Setting up…" : "Finish setup"}
      </button>
      <button
        type="button"
        className="ghost block"
        disabled={busy}
        onClick={onBack}
      >
        Back
      </button>
    </>
  );
}
