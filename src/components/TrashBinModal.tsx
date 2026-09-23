import { useState } from "react";
import { Modal } from "./Modal";
import type { TrashEntry } from "@/shared/types";

interface TrashBinModalProps {
  open?: boolean;
  trashEntries: TrashEntry[];
  onRestore: (id: string) => Promise<unknown>;
  onPurge: (id: string) => Promise<unknown>;
  onEmptyTrash: () => Promise<unknown>;
  onClose: () => void;
  onMessage?: (msg: string) => void;
}

export function TrashBinModal({
  open = true,
  trashEntries,
  onRestore,
  onPurge,
  onEmptyTrash,
  onClose,
  onMessage,
}: TrashBinModalProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const handleRestore = async (id: string, title: string) => {
    setBusyId(id);
    try {
      await onRestore(id);
      onMessage?.(`Restored "${title}" to vault.`);
    } finally {
      setBusyId(null);
    }
  };

  const handlePurge = async (id: string, title: string) => {
    if (!window.confirm(`Permanently delete "${title}"? This cannot be undone.`)) return;
    setBusyId(id);
    try {
      await onPurge(id);
      onMessage?.(`Permanently deleted "${title}".`);
    } finally {
      setBusyId(null);
    }
  };

  const handleEmpty = async () => {
    try {
      await onEmptyTrash();
      setConfirmEmpty(false);
      onMessage?.("Recycle bin emptied.");
    } catch {}
  };

  return (
    <Modal title="Trash & Recycle Bin" open={open} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ color: "#aaa", fontSize: "0.85rem", margin: 0 }}>
            {trashEntries.length === 0
              ? "Trash is empty."
              : `${trashEntries.length} deleted item(s) in recycle bin.`}
          </p>

          {trashEntries.length > 0 && !confirmEmpty && (
            <button
              type="button"
              onClick={() => setConfirmEmpty(true)}
              style={{
                background: "transparent",
                color: "#ff4438",
                border: "1px solid rgba(255,68,56,0.4)",
                borderRadius: "4px",
                padding: "0.3rem 0.6rem",
                fontSize: "0.75rem",
                cursor: "pointer",
              }}
            >
              Empty Trash
            </button>
          )}
        </div>

        {confirmEmpty && (
          <div
            style={{
              background: "rgba(255,68,56,0.1)",
              border: "1px solid #ff4438",
              padding: "0.75rem",
              borderRadius: "6px",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            <span style={{ color: "#fff", fontSize: "0.85rem", fontWeight: 600 }}>
              Permanently delete all {trashEntries.length} items?
            </span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={handleEmpty}
                style={{
                  background: "#ff4438",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  padding: "0.4rem 0.8rem",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Yes, Empty Trash
              </button>
              <button
                type="button"
                onClick={() => setConfirmEmpty(false)}
                style={{
                  background: "#222",
                  color: "#aaa",
                  border: "none",
                  borderRadius: "4px",
                  padding: "0.4rem 0.8rem",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div
          style={{
            maxHeight: "340px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
          }}
        >
          {trashEntries.map((item) => (
            <div
              key={item.id}
              style={{
                background: "#111",
                border: "1px solid #222",
                borderRadius: "6px",
                padding: "0.75rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                <div style={{ color: "#fff", fontWeight: 600, fontSize: "0.9rem" }}>
                  {item.title || "Untitled Entry"}
                </div>
                <div style={{ color: "#888", fontSize: "0.75rem" }}>
                  {item.username || "No username"} • Deleted {new Date(item.trashedAt).toLocaleDateString()}
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => handleRestore(item.id, item.title)}
                  disabled={busyId === item.id}
                  style={{
                    background: "#222",
                    color: "#fff",
                    border: "1px solid #333",
                    borderRadius: "4px",
                    padding: "0.35rem 0.7rem",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                  }}
                >
                  Restore
                </button>
                <button
                  type="button"
                  onClick={() => handlePurge(item.id, item.title)}
                  disabled={busyId === item.id}
                  style={{
                    background: "transparent",
                    color: "#ff4438",
                    border: "1px solid rgba(255,68,56,0.3)",
                    borderRadius: "4px",
                    padding: "0.35rem 0.6rem",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                  }}
                >
                  Purge
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
