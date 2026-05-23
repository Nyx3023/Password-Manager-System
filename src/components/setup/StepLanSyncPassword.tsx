interface StepLanSyncPasswordProps {
  lanSyncPw: string;
  setLanSyncPw: (val: string) => void;
  error: string | null;
  busy: boolean;
  downloadedVault: string | null;
  onRestoreBackup: (content: string, password: string) => Promise<boolean>;
  onCancel: () => void;
}

export function StepLanSyncPassword({
  lanSyncPw,
  setLanSyncPw,
  error,
  busy,
  downloadedVault,
  onRestoreBackup,
  onCancel,
}: StepLanSyncPasswordProps) {
  return (
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
        onClick={() => void onRestoreBackup(downloadedVault!, lanSyncPw)}
      >
        {busy ? "Unlocking..." : "Unlock & Finish"}
      </button>
      <button
        type="button"
        className="ghost block"
        disabled={busy}
        onClick={onCancel}
      >
        Cancel
      </button>
    </>
  );
}
