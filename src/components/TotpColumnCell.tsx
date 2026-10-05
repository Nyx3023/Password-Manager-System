import { useEffect, useState } from "react";
import { generateTotp, getTotpTimeRemaining } from "@/shared/totp";
import { useClipboard } from "@/hooks/useClipboard";

interface TotpColumnCellProps {
  secret: string;
  onCopied?: () => void;
}

/**
 * Generate SVG path for a Google Authenticator-style filled circular pie timer.
 * Starts from 12 o'clock and fills clockwise according to fraction remaining.
 */
function getGoogleAuthPiePath(remaining: number, period = 30, cx = 12, cy = 12, r = 10): string {
  const fraction = Math.max(0, Math.min(1, remaining / period));
  if (fraction <= 0.01) return "";
  if (fraction >= 0.999) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.001} ${cy - r} Z`;
  }
  const angle = fraction * 2 * Math.PI;
  const x = cx + r * Math.sin(angle);
  const y = cy - r * Math.cos(angle);
  const largeArcFlag = fraction > 0.5 ? 1 : 0;
  return `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${largeArcFlag} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`;
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
    setTimeout(() => setCopied(false), 1500);
  };

  if (!secret || !secret.trim()) return null;

  const formatted = code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
  const isExpiringSoon = remaining <= 5;
  const piePath = getGoogleAuthPiePath(remaining, 30, 12, 12, 10);

  return (
    <div
      className={`totp-google-cell${isExpiringSoon ? " totp-google-cell--warning" : ""}${
        copied ? " totp-google-cell--copied" : ""
      }`}
      onClick={(e) => {
        e.stopPropagation();
        void handleCopy();
      }}
      title="Tap code to copy"
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
      <div className="totp-google-code-wrap">
        <span className="totp-google-code">{formatted}</span>
        {copied && <span className="totp-google-copied-pill">COPIED</span>}
      </div>

      <div className="totp-google-pie-wrap" title={`${remaining}s remaining`}>
        <svg className="totp-google-pie-svg" width="22" height="22" viewBox="0 0 24 24">
          {/* Subtle background circle track */}
          <circle cx="12" cy="12" r="10" fill="rgba(66, 133, 244, 0.15)" />
          {/* Google Authenticator depleting pie wedge */}
          {piePath && (
            <path
              d={piePath}
              fill={isExpiringSoon ? "#ff4438" : "#4285f4"}
              className="totp-google-pie-path"
            />
          )}
        </svg>
      </div>
    </div>
  );
}
