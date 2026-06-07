import { useState, useMemo } from "react";
import { useClipboard } from "@/hooks/useClipboard";
import {
  entryDisplayTitle,
  entrySubtitle,
  findPerson,
  normalizeEntry,
} from "@/shared/entryUtils";
import { colorForId } from "@/shared/people";
import type { Person, VaultEntry } from "@/shared/types";
import { PersonAvatar, ServiceIcon } from "./ServiceIcon";

interface EntryDetailPaneProps {
  entry: VaultEntry | null;
  people: Person[];
  onEdit: () => void;
  onDelete: () => void;
  entries?: VaultEntry[];
}

function DetailRow({
  label,
  value,
  secret,
}: {
  label: string;
  value: string;
  secret?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const { copy } = useClipboard();

  const handleCopy = async () => {
    if (!value) return;
    await copy(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!value) return null;

  return (
    <div className="detail-row">
      <span className="detail-row-label">{label}</span>
      <div className="detail-row-value">
        <span className={secret && !visible ? "detail-secret" : ""}>
          {secret && !visible ? "********" : value}
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

export function EntryDetailPane({
  entry,
  people,
  onEdit,
  onDelete,
  entries = [],
}: EntryDetailPaneProps) {
  const duplicateEntries = useMemo(() => {
    if (!entry || !entry.password || !entries) return [];
    return entries.filter(
      (item) => item.password === entry.password && item.id !== entry.id
    );
  }, [entry, entries]);

  if (!entry) {
    return (
      <div className="desktop-detail-empty">
        <p className="muted">Select a password to view details.</p>
      </div>
    );
  }

  const e = normalizeEntry(entry);
  const person = findPerson(people, e);
  const title = entryDisplayTitle(e, people);

  return (
    <div className="entry-detail desktop-detail-pane">
      <div className="entry-detail-header">
        <ServiceIcon
          categoryId={e.categoryId}
          subcategoryId={e.subcategoryId}
          size="lg"
        />
        <div>
          <h2 className="desktop-detail-title">{title}</h2>
          <p className="entry-detail-sub">{entrySubtitle(e)}</p>
          {person && (
            <p className="entry-detail-person">
              <PersonAvatar
                name={person.name}
                emoji={person.emoji}
                color={colorForId(person.id)}
                size="sm"
              />
              {person.name}
            </p>
          )}
        </div>
      </div>

      <div className="desktop-detail-grid">
        <div className="detail-col" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <DetailRow label="Username" value={e.username} />
          <DetailRow label="Password" value={e.password} secret />
        </div>
        <div className="detail-col" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <DetailRow label="URL" value={e.url} />
          {e.notes && (
            <div className="detail-row">
              <span className="detail-row-label">Notes</span>
              <p className="detail-notes">{e.notes}</p>
            </div>
          )}
        </div>
      </div>

      {duplicateEntries.length > 0 && (
        <div className="duplicate-warning-box" style={{
          marginTop: "16px",
          padding: "12px",
          borderRadius: "8px",
          background: "rgba(255, 68, 68, 0.1)",
          border: "1px solid rgba(255, 68, 68, 0.2)",
          fontSize: "0.82rem",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          boxSizing: "border-box",
          marginBottom: "16px"
        }}>
          <span style={{ fontWeight: "600", color: "var(--danger)" }}>
            ⚠️ Password Reuse Warning
          </span>
          <span className="muted" style={{ fontSize: "0.78rem" }}>
            This password is also used for:{" "}
            {duplicateEntries.map((item, index) => {
              const displayTitle = entryDisplayTitle(normalizeEntry(item), people);
              return (
                <span key={item.id} style={{ color: "var(--text)", fontWeight: "500" }}>
                  {displayTitle}
                  {index < duplicateEntries.length - 1 ? ", " : ""}
                </span>
              );
            })}
          </span>
        </div>
      )}

      <div className="entry-detail-actions" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <button type="button" className="primary" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="ghost danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}
