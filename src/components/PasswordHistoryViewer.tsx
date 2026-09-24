import { useState } from "react";
import type { PasswordHistoryItem } from "@/shared/types";
import { useClipboard } from "@/hooks/useClipboard";

export function PasswordHistoryViewer({
  history,
}: {
  history?: PasswordHistoryItem[];
}) {
  const [open, setOpen] = useState(false);
  const [revealedIdxs, setRevealedIdxs] = useState<Set<number>>(new Set());
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const { copy } = useClipboard();

  if (!history || history.length === 0) return null;

  const toggleReveal = (idx: number) => {
    setRevealedIdxs((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleCopy = async (pwd: string, idx: number) => {
    await copy(pwd);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const formatTimestamp = (iso: string) => {
    try {
      const date = new Date(iso);
      return `${date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })} ${date.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    } catch (_) {
      return iso;
    }
  };

  return (
    <div
      style={{
        marginTop: "12px",
        borderTop: "1px solid #222",
        paddingTop: "10px",
      }}
    >
      <button
        type="button"
        className="ghost small"
        onClick={() => setOpen((v) => !v)}
        style={{
          color: "#aaa",
          fontSize: "0.8rem",
          padding: "4px 0",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          cursor: "pointer",
        }}
      >
        <span>{open ? "▲" : "▼"}</span>
        <strong>Password History ({history.length})</strong>
      </button>

      {open && (
        <div
          style={{
            marginTop: "8px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          {history.map((item, idx) => {
            const isRevealed = revealedIdxs.has(idx);
            const isCopied = copiedIdx === idx;

            return (
              <div
                key={idx}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "#111",
                  border: "1px solid #222",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  fontSize: "0.8rem",
                  gap: "8px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "monospace",
                      letterSpacing: isRevealed ? "0.05em" : "0.15em",
                      color: isRevealed ? "#fff" : "#777",
                      wordBreak: "break-all",
                    }}
                  >
                    {isRevealed ? item.password : "••••••••••••"}
                  </div>
                  <div style={{ color: "#666", fontSize: "0.7rem" }}>
                    Changed {formatTimestamp(item.changedAt)}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "4px",
                    alignItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <button
                    type="button"
                    className="ghost small"
                    title={isRevealed ? "Hide password" : "Show password"}
                    style={{ padding: "4px 6px", fontSize: "0.8rem" }}
                    onClick={() => toggleReveal(idx)}
                  >
                    {isRevealed ? "Hide" : "Show"}
                  </button>

                  <button
                    type="button"
                    className="ghost small"
                    onClick={() => handleCopy(item.password, idx)}
                    style={{
                      padding: "4px 8px",
                      fontSize: "0.8rem",
                      color: isCopied ? "var(--accent, #10b981)" : undefined,
                    }}
                  >
                    {isCopied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
