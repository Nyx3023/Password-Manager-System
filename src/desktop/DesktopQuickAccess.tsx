import { useEffect, useRef, useState } from "react";
import type { VaultEntry } from "@/shared/types";
import { generateTotp } from "@/shared/totp";

interface DesktopQuickAccessProps {
  entries: VaultEntry[];
  unlocked: boolean;
  onClose: () => void;
  onCopy: (label: string, value: string) => void;
  onUnlockRequest?: () => void;
}

export function DesktopQuickAccess({
  entries,
  unlocked,
  onClose,
  onCopy,
  onUnlockRequest,
}: DesktopQuickAccessProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = entries.filter((e) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      e.title.toLowerCase().includes(q) ||
      e.username.toLowerCase().includes(q) ||
      e.url.toLowerCase().includes(q)
    );
  }).slice(0, 8);

  const selected = filtered[selectedIndex];

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
      return;
    }
    if (e.key === "Enter" && selected) {
      e.preventDefault();
      onCopy("Password", selected.password);
      onClose();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "u" && selected) {
      e.preventDefault();
      onCopy("Username", selected.username);
      onClose();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "t" && selected?.totpSeed) {
      e.preventDefault();
      try {
        const code = await generateTotp(selected.totpSeed);
        onCopy("2FA Code", code);
        onClose();
      } catch {}
      return;
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(6px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "580px",
          background: "#0d0d0d",
          border: "1px solid #333",
          borderRadius: "10px",
          boxShadow: "0 20px 50px rgba(0,0,0,0.8)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "0.85rem 1rem", borderBottom: "1px solid #222", display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ color: "#ff4438", fontWeight: 700, fontSize: "0.9rem", letterSpacing: "0.05em" }}>
            SecureX
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={unlocked ? "Type to search credentials... (Enter: pass, Ctrl+U: user, Ctrl+T: 2FA)" : "SecureX is locked. Click to unlock."}
            disabled={!unlocked}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#fff",
              fontSize: "1rem",
              fontFamily: "inherit",
            }}
          />
          <span style={{ color: "#555", fontSize: "0.75rem", border: "1px solid #222", padding: "0.2rem 0.4rem", borderRadius: "4px" }}>
            ESC
          </span>
        </div>

        {!unlocked ? (
          <div style={{ padding: "2rem", textAlign: "center" }}>
            <p style={{ color: "#aaa", fontSize: "0.9rem", marginBottom: "1rem" }}>
              SecureX vault is currently locked.
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                onUnlockRequest?.();
              }}
              style={{
                background: "#fff",
                color: "#000",
                fontWeight: 600,
                padding: "0.5rem 1.25rem",
                borderRadius: "6px",
                border: "none",
                cursor: "pointer",
              }}
            >
              Unlock Vault
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "#666", fontSize: "0.9rem" }}>
            No matching accounts found.
          </div>
        ) : (
          <div style={{ maxHeight: "320px", overflowY: "auto", padding: "0.5rem" }}>
            {filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    onCopy("Password", item.password);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    padding: "0.65rem 0.85rem",
                    borderRadius: "6px",
                    background: isSelected ? "#1a1a1a" : "transparent",
                    border: isSelected ? "1px solid #333" : "1px solid transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                    <span style={{ color: isSelected ? "#fff" : "#ddd", fontWeight: 600, fontSize: "0.9rem" }}>
                      {item.title}
                    </span>
                    <span style={{ color: "#777", fontSize: "0.75rem" }}>
                      {item.username || item.url || "No username"}
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                    {item.totpSeed && (
                      <span
                        style={{
                          background: "rgba(255,68,56,0.15)",
                          color: "#ff4438",
                          fontSize: "0.65rem",
                          fontWeight: 700,
                          padding: "0.15rem 0.4rem",
                          borderRadius: "3px",
                        }}
                      >
                        2FA
                      </span>
                    )}
                    {isSelected && (
                      <span style={{ color: "#888", fontSize: "0.7rem" }}>
                        Press Enter ↵
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
