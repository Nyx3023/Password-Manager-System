import { useState } from "react";

export interface DetailRowProps {
  label: string;
  value: string;
  secret?: boolean;
  onCopy: (label: string, value: string) => void | Promise<void>;
}

export function DetailRow({ label, value, secret, onCopy }: DetailRowProps) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value) return;
    await onCopy(label, value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!value) return null;

  return (
    <div className="detail-row">
      <span className="detail-row-label">{label}</span>
      <div className="detail-row-value">
        <span className={secret && !visible ? "detail-secret" : ""}>
          {secret && !visible ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : value}
        </span>
        <div className="detail-row-actions">
          {secret && (
            <button
              type="button"
              className="ghost small"
              onClick={() => setVisible((v) => !v)}
            >
              {visible ? "Hide" : "Show"}
            </button>
          )}
          <button
            type="button"
            className="ghost small"
            onClick={() => void handleCopy()}
            style={copied ? { color: "var(--accent)" } : undefined}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
