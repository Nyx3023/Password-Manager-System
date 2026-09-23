import { useEffect, useState } from "react";
import { generateTotp, getTotpTimeRemaining } from "@/shared/totp";
import { useClipboard } from "@/hooks/useClipboard";

interface TotpDisplayProps {
  secret: string;
  label?: string;
  onCopyNotice?: (msg: string) => void;
}

export function TotpDisplay({ secret, label = "2FA Code", onCopyNotice }: TotpDisplayProps) {
  const [code, setCode] = useState<string>("------");
  const [remaining, setRemaining] = useState<number>(30);
  const [copied, setCopied] = useState<boolean>(false);
  const { copy } = useClipboard();

  useEffect(() => {
    if (!secret.trim()) return;

    let mounted = true;
    const update = async () => {
      try {
        const c = await generateTotp(secret);
        if (mounted) {
          setCode(c);
          setRemaining(getTotpTimeRemaining());
        }
      } catch {
        if (mounted) setCode("INVALID");
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
    if (code === "------" || code === "INVALID") return;
    await copy(code);
    setCopied(true);
    onCopyNotice?.("2FA Code copied - clears in 30s");
    setTimeout(() => setCopied(false), 2000);
  };

  if (!secret.trim()) return null;

  const formatted = code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
  const progressPercent = (remaining / 30) * 100;

  return (
    <div className="detail-row">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="detail-row-label">{label}</span>
        <span
          style={{
            fontSize: "0.75rem",
            color: remaining <= 5 ? "#ff4438" : "#888",
            fontFamily: "monospace",
          }}
        >
          {remaining}s
        </span>
      </div>

      <div
        className="detail-row-value"
        onClick={handleCopy}
        style={{ cursor: "pointer" }}
        title="Click to copy 2FA code"
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span
            style={{
              fontFamily: "monospace",
              fontSize: "1.25rem",
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: remaining <= 5 ? "#ff4438" : "#fff",
            }}
          >
            {formatted}
          </span>
          <div
            style={{
              width: "36px",
              height: "4px",
              background: "#222",
              borderRadius: "2px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progressPercent}%`,
                height: "100%",
                background: remaining <= 5 ? "#ff4438" : "var(--accent, #ff4438)",
                transition: "width 1s linear",
              }}
            />
          </div>
        </div>

        <div className="detail-row-actions">
          <button
            type="button"
            className="ghost small"
            onClick={(e) => {
              e.stopPropagation();
              void handleCopy();
            }}
            style={copied ? { color: "var(--accent, #ff4438)" } : undefined}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
