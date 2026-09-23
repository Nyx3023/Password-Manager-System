import { useState, useId } from "react";
import { Modal } from "./Modal";
import type { Person } from "@/shared/types";
import {
  parseGoogleAuthMigrationUri,
  parseAegisJson,
  parse2FasJson,
  parseOtpauthUri,
  type TotpAccount,
} from "@/shared/totp";

interface TotpImporterModalProps {
  open?: boolean;
  people: Person[];
  onImport: (accounts: TotpAccount[], personId: string) => Promise<number>;
  onClose: () => void;
  onMessage?: (msg: string) => void;
}

export function TotpImporterModal({
  open = true,
  people,
  onImport,
  onClose,
  onMessage,
}: TotpImporterModalProps) {
  const [input, setInput] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState(people[0]?.id || "");
  const [parsedAccounts, setParsedAccounts] = useState<TotpAccount[]>([]);
  const [sourceType, setSourceType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputId = useId();

  const handleParse = () => {
    setError(null);
    const trimmed = input.trim();
    if (!trimmed) {
      setError("Please paste your authenticator export data or URI.");
      return;
    }

    // 1. Check for Google Authenticator migration URI
    if (trimmed.includes("otpauth-migration://")) {
      const accounts = parseGoogleAuthMigrationUri(trimmed);
      if (accounts.length > 0) {
        setParsedAccounts(accounts);
        setSourceType("Google Authenticator");
        return;
      }
    }

    // 2. Check for JSON (Aegis or 2FAS)
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      const aegis = parseAegisJson(trimmed);
      if (aegis.length > 0) {
        setParsedAccounts(aegis);
        setSourceType("Aegis Authenticator");
        return;
      }

      const twoFas = parse2FasJson(trimmed);
      if (twoFas.length > 0) {
        setParsedAccounts(twoFas);
        setSourceType("2FAS Authenticator");
        return;
      }
    }

    // 3. Check for standard otpauth:// lines
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().startsWith("otpauth://"));
    if (lines.length > 0) {
      const accounts: TotpAccount[] = [];
      for (const line of lines) {
        const acc = parseOtpauthUri(line);
        if (acc) accounts.push(acc);
      }
      if (accounts.length > 0) {
        setParsedAccounts(accounts);
        setSourceType("Standard OTP URI");
        return;
      }
    }

    // Single secret fallback
    const single = parseOtpauthUri(trimmed);
    if (single) {
      setParsedAccounts([single]);
      setSourceType("Standard OTP URI");
      return;
    }

    setError("Could not recognize authenticator format. Supported: Google Authenticator URI, Aegis JSON, 2FAS JSON, or otpauth:// links.");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setInput(content);
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = async () => {
    if (parsedAccounts.length === 0) return;
    setBusy(true);
    try {
      const count = await onImport(parsedAccounts, selectedPersonId);
      onMessage?.(`Successfully imported ${count} 2FA account(s).`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Import 2FA Accounts" open={open} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <p style={{ color: "#aaa", fontSize: "0.875rem", margin: 0 }}>
          Import two-factor authentication accounts from Google Authenticator, Aegis, 2FAS, or standard otpauth:// URIs.
        </p>

        {parsedAccounts.length === 0 ? (
          <>
            <div>
              <label
                htmlFor={inputId}
                style={{
                  display: "block",
                  color: "#888",
                  fontSize: "0.75rem",
                  letterSpacing: "0.05em",
                  marginBottom: "0.5rem",
                  textTransform: "uppercase",
                }}
              >
                Paste Export Text or Link
              </label>
              <textarea
                id={inputId}
                rows={6}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Paste otpauth-migration:// link, otpauth:// URI, or JSON export here..."
                style={{
                  width: "100%",
                  background: "#111",
                  border: "1px solid #333",
                  color: "#fff",
                  padding: "0.75rem",
                  borderRadius: "6px",
                  fontSize: "0.85rem",
                  fontFamily: "monospace",
                  boxSizing: "border-box",
                  resize: "vertical",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label
                style={{
                  cursor: "pointer",
                  color: "#888",
                  fontSize: "0.8rem",
                  textDecoration: "underline",
                }}
              >
                Or upload .json file
                <input
                  type="file"
                  accept=".json,.txt"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                />
              </label>

              <button
                type="button"
                onClick={handleParse}
                disabled={!input.trim()}
                style={{
                  background: "#fff",
                  color: "#000",
                  fontWeight: 600,
                  padding: "0.5rem 1rem",
                  borderRadius: "6px",
                  border: "none",
                  cursor: "pointer",
                  opacity: input.trim() ? 1 : 0.5,
                }}
              >
                Analyze Data
              </button>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div
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
              <div>
                <div style={{ color: "#fff", fontWeight: 600, fontSize: "0.9rem" }}>
                  {parsedAccounts.length} Account(s) Found
                </div>
                <div style={{ color: "#888", fontSize: "0.75rem" }}>
                  Format: {sourceType}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setParsedAccounts([]);
                  setSourceType(null);
                }}
                style={{
                  background: "transparent",
                  color: "#888",
                  border: "1px solid #333",
                  borderRadius: "4px",
                  padding: "0.3rem 0.6rem",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                }}
              >
                Reset
              </button>
            </div>

            <div style={{ maxHeight: "200px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {parsedAccounts.map((acc, idx) => (
                <div
                  key={idx}
                  style={{
                    background: "#0a0a0a",
                    border: "1px solid #1a1a1a",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "4px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ color: "#eee", fontSize: "0.85rem" }}>
                    {acc.issuer ? `${acc.issuer} — ` : ""}
                    {acc.name}
                  </span>
                  <span style={{ color: "#666", fontSize: "0.75rem", fontFamily: "monospace" }}>
                    {acc.secret.slice(0, 4)}••••
                  </span>
                </div>
              ))}
            </div>

            {people.length > 1 && (
              <div>
                <label
                  style={{
                    display: "block",
                    color: "#888",
                    fontSize: "0.75rem",
                    marginBottom: "0.4rem",
                    textTransform: "uppercase",
                  }}
                >
                  Assign To Person
                </label>
                <select
                  value={selectedPersonId}
                  onChange={(e) => setSelectedPersonId(e.target.value)}
                  style={{
                    width: "100%",
                    background: "#111",
                    border: "1px solid #333",
                    color: "#fff",
                    padding: "0.6rem",
                    borderRadius: "6px",
                  }}
                >
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.emoji ? `${p.emoji} ` : ""}{p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={busy}
              style={{
                background: "#ff4438",
                color: "#fff",
                fontWeight: 600,
                padding: "0.75rem",
                borderRadius: "6px",
                border: "none",
                cursor: "pointer",
                marginTop: "0.5rem",
              }}
            >
              {busy ? "Importing..." : `Import ${parsedAccounts.length} 2FA Account(s)`}
            </button>
          </div>
        )}

        {error && (
          <div style={{ color: "#ff4438", fontSize: "0.8rem", background: "rgba(255,68,56,0.1)", padding: "0.5rem", borderRadius: "4px" }}>
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
