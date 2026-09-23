import { useState } from "react";
import type { PasswordHistoryItem } from "@/shared/types";
import { useClipboard } from "@/hooks/useClipboard";

export function PasswordHistoryViewer({ history }: { history?: PasswordHistoryItem[] }) {
  const [open, setOpen] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const { copy } = useClipboard();

  if (!history || history.length === 0) return null;

  const handleCopy = async (pwd: string, idx: number) => {
    await copy(pwd);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div style={{ marginTop: "10px", borderTop: "1px solid #222", paddingTop: "8px" }}>
      <button
        type="button"
        className="ghost small"
        onClick={() => setOpen((v) => !v)}
        style={{ color: "#888", fontSize: "0.75rem", padding: "0" }}
      >
        {open ? "▲ Hide password history" : `▼ Password history (${history.length})`}
      </button>

      {open && (
        <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
          {history.map((item, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#111",
                padding: "6px 8px",
                borderRadius: "4px",
                fontSize: "0.75rem",
              }}
            >
              <div>
                <span style={{ color: "#aaa", fontFamily: "monospace" }}>••••••••</span>
                <span style={{ color: "#666", marginLeft: "8px" }}>
                  {new Date(item.changedAt).toLocaleDateString()}
                </span>
              </div>
              <button
                type="button"
                className="ghost small"
                onClick={() => handleCopy(item.password, idx)}
                style={copiedIdx === idx ? { color: "var(--accent)" } : undefined}
              >
                {copiedIdx === idx ? "Copied!" : "Copy"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
