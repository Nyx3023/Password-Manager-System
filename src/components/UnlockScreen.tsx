import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { MpinPad } from "./MpinPad";

type UnlockMode = "mpin" | "recovery";

interface UnlockScreenProps {
  busy: boolean;
  error: string | null;
  biometricsEnabled: boolean;
  biometricsAvailable: boolean;
  mpinEnabled: boolean;
  onUnlockPassword: (password: string) => Promise<boolean>;
  onUnlockMpin: (mpin: string) => Promise<boolean>;
  onUnlockBiometric: () => Promise<boolean>;
  onRestoreBackup: (content: string, password: string) => Promise<boolean>;
  onResetApp?: () => Promise<boolean>;
}

export function UnlockScreen({
  busy,
  error,
  biometricsEnabled,
  biometricsAvailable,
  mpinEnabled,
  onUnlockPassword,
  onUnlockMpin,
  onUnlockBiometric,
  onResetApp,
}: UnlockScreenProps) {
  const canUseBiometric = biometricsEnabled && biometricsAvailable;

  const [mode, setMode] = useState<UnlockMode>(() =>
    mpinEnabled ? "mpin" : "recovery",
  );
  const [mpin, setMpin] = useState("");
  const [mpinErrorFlash, setMpinErrorFlash] = useState(false);
  const [password, setPassword] = useState("");

  const bioPrompted = useRef(false);

  const tryBiometricUnlock = useCallback(async () => {
    if (busy || !canUseBiometric) return;
    await onUnlockBiometric();
  }, [busy, canUseBiometric, onUnlockBiometric]);

  useEffect(() => {
    if (bioPrompted.current) return;
    if (!canUseBiometric || !mpinEnabled || mode !== "mpin") return;
    bioPrompted.current = true;
    void tryBiometricUnlock();
  }, [canUseBiometric, mpinEnabled, mode, tryBiometricUnlock]);

  const tryMpinUnlock = async (code: string) => {
    if (busy) return;
    const ok = await onUnlockMpin(code);
    if (!ok) {
      setMpin("");
      setMpinErrorFlash(true);
      window.setTimeout(() => setMpinErrorFlash(false), 1000);
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await onUnlockPassword(password);
    if (ok) setPassword("");
  };

  const handleReset = async () => {
    if (!onResetApp) return;
    const ok = confirm(
      "Erase all vault data, people, passwords, and cached icons? This cannot be undone.",
    );
    if (!ok) return;
    await onResetApp();
  };

  return (
    <div className="screen unlock-screen unlock-screen--mpin">
      <div className="unlock-mpin-center">
        <p className="setup-brand">PASSWORD MANAGER</p>
        <div className="dot-matrix small" aria-hidden>
          {Array.from({ length: 12 }).map((_, i) => (
            <span
              key={i}
              className={i % 5 === 0 ? "dot dot--accent" : "dot"}
            />
          ))}
        </div>

        {mode === "mpin" && mpinEnabled && (
          <>
            <p className="label-mono center-text">ENTER MPIN</p>
            <MpinPad
              size="large"
              value={mpin}
              errorFlash={mpinErrorFlash}
              onChange={setMpin}
              onComplete={(code) => void tryMpinUnlock(code)}
            />
            {canUseBiometric && (
              <button
                type="button"
                className="text-link"
                disabled={busy}
                onClick={() => void tryBiometricUnlock()}
              >
                Use biometrics
              </button>
            )}
            <button
              type="button"
              className="text-link"
              onClick={() => {
                setMode("recovery");
                setMpin("");
              }}
            >
              Forgot MPIN?
            </button>
          </>
        )}

        {mode === "recovery" && (
          <>
            <h1 className="setup-title center-text">Recovery unlock</h1>
            <p className="setup-sub center-text">
              Master password is for recovery only. Use it if you forgot your
              MPIN or need to export your vault.
            </p>
            <form
              onSubmit={handlePasswordSubmit}
              className="stack unlock-password-form"
            >
              <label>
                Master password
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                />
              </label>
              {error && <p className="error">{error}</p>}
              <button type="submit" className="primary block" disabled={busy}>
                {busy ? "Please wait..." : "Unlock with master password"}
              </button>
            </form>
            {mpinEnabled && (
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setMode("mpin");
                  setPassword("");
                }}
              >
                Back to MPIN
              </button>
            )}
            {onResetApp && (
              <button
                type="button"
                className="dev-reset-btn"
                disabled={busy}
                onClick={() => void handleReset()}
              >
                Reset app (dev)
              </button>
            )}
          </>
        )}

        {mode === "mpin" && !mpinEnabled && (
          <>
            <p className="setup-sub center-text">
              This vault has no MPIN yet. Unlock with your master password, then
              set an MPIN in Settings.
            </p>
            <button
              type="button"
              className="primary block"
              onClick={() => setMode("recovery")}
            >
              Recovery unlock
            </button>
          </>
        )}
      </div>
    </div>
  );
}
