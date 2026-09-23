import { useState } from "react";
import type { CustomField } from "@/shared/types";
import { useClipboard } from "@/hooks/useClipboard";

interface CustomFieldsEditorProps {
  fields: CustomField[];
  onChange: (fields: CustomField[]) => void;
}

export function CustomFieldsEditor({ fields, onChange }: CustomFieldsEditorProps) {
  const [newLabel, setNewLabel] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newType, setNewType] = useState<"text" | "hidden">("text");

  const handleAddField = () => {
    if (!newLabel.trim()) return;
    const added: CustomField = {
      id: crypto.randomUUID(),
      label: newLabel.trim(),
      value: newValue,
      type: newType,
    };
    onChange([...fields, added]);
    setNewLabel("");
    setNewValue("");
  };

  const handleRemoveField = (id: string) => {
    onChange(fields.filter((f) => f.id !== id));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <label style={{ color: "#888", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Custom Fields
      </label>

      {fields.map((field) => (
        <div
          key={field.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            background: "#111",
            padding: "0.4rem 0.6rem",
            borderRadius: "4px",
            border: "1px solid #222",
          }}
        >
          <span style={{ color: "#888", fontSize: "0.8rem", width: "30%", overflow: "hidden", textOverflow: "ellipsis" }}>
            {field.label}:
          </span>
          <span style={{ color: "#fff", fontSize: "0.85rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
            {field.type === "hidden" ? "••••••••" : field.value}
          </span>
          <button
            type="button"
            className="ghost small"
            onClick={() => handleRemoveField(field.id)}
            style={{ color: "#ff4438", padding: "0.2rem 0.4rem" }}
          >
            ×
          </button>
        </div>
      ))}

      <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginTop: "0.2rem" }}>
        <input
          type="text"
          placeholder="Field name (e.g. PIN, Security Q)"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          style={{
            flex: 1,
            background: "#111",
            border: "1px solid #333",
            color: "#fff",
            padding: "0.4rem 0.6rem",
            borderRadius: "4px",
            fontSize: "0.8rem",
          }}
        />
        <input
          type={newType === "hidden" ? "password" : "text"}
          placeholder="Value"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          style={{
            flex: 1,
            background: "#111",
            border: "1px solid #333",
            color: "#fff",
            padding: "0.4rem 0.6rem",
            borderRadius: "4px",
            fontSize: "0.8rem",
          }}
        />
        <select
          value={newType}
          onChange={(e) => setNewType(e.target.value as "text" | "hidden")}
          style={{
            background: "#111",
            border: "1px solid #333",
            color: "#888",
            padding: "0.4rem",
            borderRadius: "4px",
            fontSize: "0.75rem",
          }}
        >
          <option value="text">Text</option>
          <option value="hidden">Hidden</option>
        </select>
        <button
          type="button"
          onClick={handleAddField}
          disabled={!newLabel.trim()}
          style={{
            background: "#222",
            color: "#fff",
            border: "1px solid #333",
            padding: "0.4rem 0.8rem",
            borderRadius: "4px",
            fontSize: "0.8rem",
            cursor: "pointer",
            opacity: newLabel.trim() ? 1 : 0.5,
          }}
        >
          + Add
        </button>
      </div>
    </div>
  );
}

export function CustomFieldsDisplay({ fields }: { fields?: CustomField[] }) {
  const { copy } = useClipboard();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());

  if (!fields || fields.length === 0) return null;

  const toggleVisible = (id: string) => {
    setVisibleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopy = async (field: CustomField) => {
    await copy(field.value);
    setCopiedId(field.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {fields.map((f) => {
        const isHidden = f.type === "hidden";
        const isRevealed = visibleIds.has(f.id);
        return (
          <div key={f.id} className="detail-row">
            <span className="detail-row-label">{f.label}</span>
            <div className="detail-row-value">
              <span>{isHidden && !isRevealed ? "••••••••" : f.value}</span>
              <div className="detail-row-actions">
                {isHidden && (
                  <button
                    type="button"
                    className="ghost small"
                    onClick={() => toggleVisible(f.id)}
                  >
                    {isRevealed ? "Hide" : "Show"}
                  </button>
                )}
                <button
                  type="button"
                  className="ghost small"
                  onClick={() => handleCopy(f)}
                  style={copiedId === f.id ? { color: "var(--accent)" } : undefined}
                >
                  {copiedId === f.id ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
