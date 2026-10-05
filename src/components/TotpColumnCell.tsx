import { useEffect, useState } from "react";
import { generateTotp, getTotpTimeRemaining } from "@/shared/totp";
import { useClipboard } from "@/hooks/useClipboard";

interface TotpColumnCellProps {
  secret: string;
  onCopied?: () => void;
}

export function TotpColumnCell({ secret, onCopied }: TotpColumnCellProps) {
  const [code, setCode] = useState<string>("------");
  const [remaining, setRemaining] = useState<number>(30);
  const [copied, setCopied] = useState<boolean>(false);
  const { copy } = useClipboard();

  useEffect(() => {
    if (!secret || !secret.trim()) return;

    let mounted = true;
    const update = async () => {
      try {
        const c = await generateTotp(secret.trim());
        if (mounted) {
          setCode(c);
          setRemaining(getTotpTimeRemaining());
        }
      } catch {
        if (mounted) setCode("ERR");
      }
    };

    void update();
    const interval = setInterval(update, 1000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [secret]);

  const handleCopy = async () => {
    if (code === "------" || code === "ERR") return;
    await copy(code);
    setCopied(true);
    onCopied?.();
    setTimeout(() => setCopied(false), 2000);
  };

  if (!secret || !secret.trim()) return null;

  const formatted = code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
  const progressPercent = Math.max(0, Math.min(100, (remaining / 30) * 100));
  const isExpiringSoon = remaining <= 5;

  return (
    <div
      className={`totp-col-cell${isExpiringSoon ? " totp-col-cell--warning" : ""}${
        copied ? " totp-col-cell--copied" : ""
      }`}
      onClick={(e) => {
        e.stopPropagation();
        void handleCopy();
      }}
      title="Click to copy 2FA code"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          void handleCopy();
        }
      }}
    >
      <div className="totp-col-info">
        <span className="totp-col-code">{formatted}</span>
        <div className="totp-col-timer">
          <svg className="totp-col-ring" width="14" height="14" viewBox="0 0 36 36">
            <path
              className="totp-col-ring-bg"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className="totp-col-ring-fg"
              strokeDasharray={`${progressPercent}, 100`}
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <span className="totp-col-seconds">{remaining}s</span>
        </div>
      </div>

      <button
        type="button"
        className={`totp-col-copy-btn${copied ? " copied" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          void handleCopy();
        }}
        aria-label="Copy 2FA Code"
      >
        {copied ? "COPIED" : "COPY"}
      </button>
    </div>
  );
}
