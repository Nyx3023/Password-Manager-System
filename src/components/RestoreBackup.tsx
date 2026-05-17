import { useState } from "react";
import { pickVaultImportFile } from "@/shared/transfer";

interface RestoreBackupProps {
  busy: boolean;
  onRestore: (content: string, password: string) => Promise<boolean>;
}

export function RestoreBackup({ busy, onRestore }: RestoreBackupProps) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const handleRestore = async () => {
    setMessage(null);
    try {
      const content = await pickVaultImportFile();
      if (!password) {
        setMessage("Enter the backup master password.");
        return;
      }
      const ok = await onRestore(content, password);
      if (ok) {
        setOpen(false);
        setPassword("");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Restore failed.");
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        className="ghost restore-link"
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        Restore from backup file
      </button>
    );
  }

  return (
    <div className="restore-panel stack">
      <p className="muted small">Select your `.pms` backup and enter its master password.</p>
      <label>
        Backup master password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {message && <p className="error">{message}</p>}
      <div className="row-actions">
        <button type="button" className="ghost small" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() => void handleRestore()}
        >
          Import & unlock
        </button>
      </div>
    </div>
  );
}
