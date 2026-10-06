import { useMemo, useState } from "react";
import type { Person, VaultEntry } from "@/shared/types";
import { normalizeEntry } from "@/shared/entryUtils";
import { generateTotp, getTotpTimeRemaining } from "@/shared/totp";
import { useClipboard } from "@/hooks/useClipboard";
import { useEffect } from "react";
import { TotpAddModal } from "./TotpAddModal";
import type { TotpAccount } from "@/shared/totp";

interface AuthenticatorViewProps {
  entries: VaultEntry[];
  people: Person[];
  onAdd: (data: Omit<VaultEntry, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  onUpdate: (id: string, data: Omit<VaultEntry, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onImportTotp?: (accounts: TotpAccount[], personId: string) => Promise<number>;
  onMessage: (msg: string) => void;
  onSelectEntry?: (entry: VaultEntry) => void;
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

/**
 * Format header: Service (Username). Never include email domains.
 * e.g. Instagram (iamsarammorrison)
 */
function formatHeader(entry: VaultEntry): string {
  const service = entry.title?.trim() || entry.url?.trim() || "Authenticator";
  let user = entry.username?.trim();
  if (!user) return service;
  // If user is formatted as an email, extract only the username portion
  if (user.includes("@")) {
    user = user.split("@")[0];
  }
  return `${service} (${user})`;
}

interface GoogleAuthItemProps {
  entry: VaultEntry;
  onCopyNotice: (msg: string) => void;
  onSelect?: () => void;
}

function GoogleAuthItem({ entry, onCopyNotice, onSelect }: GoogleAuthItemProps) {
  const [code, setCode] = useState<string>("------");
  const [remaining, setRemaining] = useState<number>(30);
  const [copied, setCopied] = useState(false);
  const { copy } = useClipboard();

  const secret = entry.totpSeed?.trim() || "";

  useEffect(() => {
    if (!secret) return;
    let mounted = true;

    const update = async () => {
      try {
        const c = await generateTotp(secret);
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

  const handleCopy = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (code === "------" || code === "ERR") return;
    await copy(code);
    setCopied(true);
    onCopyNotice(`2FA code copied`);
    setTimeout(() => setCopied(false), 1500);
  };

  const formattedCode =
    code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
  const isExpiringSoon = remaining <= 5;
  const piePath = getGoogleAuthPiePath(remaining, 30, 12, 12, 10);
  const header = formatHeader(entry);

  return (
    <div
      className={`google-auth-card${isExpiringSoon ? " google-auth-card--warning" : ""}${
        copied ? " google-auth-card--copied" : ""
      }`}
      onClick={() => void handleCopy()}
      role="button"
      tabIndex={0}
      title="Tap code to copy"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void handleCopy();
        }
      }}
    >
      <div className="google-auth-card-top">
        <span className="google-auth-header-text">{header}</span>
        {onSelect && (
          <button
            type="button"
            className="google-auth-options-btn"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            title="Account details & options"
          >
            ⋮
          </button>
        )}
      </div>

      <div className="google-auth-card-bottom">
        <div className="google-auth-code-wrap">
          <span className="google-auth-code">{formattedCode}</span>
          {copied && <span className="google-auth-copied-pill">COPIED</span>}
        </div>

        <div className="google-auth-pie-wrap" title={`${remaining}s remaining`}>
          <svg className="google-auth-pie-svg" width="28" height="28" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill="rgba(66, 133, 244, 0.15)" />
            {piePath && (
              <path
                d={piePath}
                fill={isExpiringSoon ? "#ff4438" : "#4285f4"}
                className="google-auth-pie-path"
              />
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}

export function AuthenticatorView({
  entries,
  people,
  onAdd,
  onImportTotp,
  onMessage,
  onSelectEntry,
}: AuthenticatorViewProps) {
  const [query, setQuery] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);

  // Filter only entries that have totpSeed
  const totpEntries = useMemo(() => {
    return entries.filter((e) => {
      const norm = normalizeEntry(e);
      return Boolean(norm.totpSeed && norm.totpSeed.trim());
    });
  }, [entries]);

  // Filter by query
  const filteredEntries = useMemo(() => {
    if (!query.trim()) return totpEntries;
    const q = query.toLowerCase().trim();
    return totpEntries.filter((e) => {
      const header = formatHeader(e).toLowerCase();
      const service = (e.title || "").toLowerCase();
      const user = (e.username || "").toLowerCase();
      return header.includes(q) || service.includes(q) || user.includes(q);
    });
  }, [totpEntries, query]);

  return (
    <div className="authenticator-screen">
      <div className="authenticator-toolbar">
        <input
          type="search"
          className="search authenticator-search"
          placeholder="Search authenticator accounts..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className="primary authenticator-add-btn"
          onClick={() => setAddModalOpen(true)}
        >
          + Add Account
        </button>
      </div>

      {totpEntries.length === 0 ? (
        <div className="vault-home-empty authenticator-empty">
          <div className="dot-matrix" aria-hidden>
            {Array.from({ length: 16 }).map((_, i) => (
              <span key={i} className={i % 5 === 0 ? "dot dot--accent" : "dot"} />
            ))}
          </div>
          <h2 className="vault-home-title">Authenticator</h2>
          <p className="muted vault-home-sub">
            No 2FA accounts added yet. Scan a QR code or import from Google Authenticator export.
          </p>
          <button
            type="button"
            className="primary"
            style={{ marginTop: "1rem" }}
            onClick={() => setAddModalOpen(true)}
          >
            + Add Authenticator Account
          </button>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="vault-empty">
          <p className="muted">No matching authenticator accounts.</p>
        </div>
      ) : (
        <div className="google-auth-grid">
          {filteredEntries.map((entry) => (
            <GoogleAuthItem
              key={entry.id}
              entry={entry}
              onCopyNotice={onMessage}
              onSelect={onSelectEntry ? () => onSelectEntry(entry) : undefined}
            />
          ))}
        </div>
      )}

      <TotpAddModal
        open={addModalOpen}
        people={people}
        onClose={() => setAddModalOpen(false)}
        onSave={async (data) => {
          await onAdd(data);
          setAddModalOpen(false);
          onMessage("Authenticator account added.");
        }}
        onImportTotp={onImportTotp}
        onMessage={onMessage}
      />
    </div>
  );
}
