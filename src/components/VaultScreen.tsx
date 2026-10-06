import { useEffect, useMemo, useState } from "react";
import { entryDisplayTitle, normalizeEntry } from "@/shared/entryUtils";
import { colorForId } from "@/shared/people";
import type {
  ImportMode,
  Person,
  PersonCategoryId,
  TrashEntry,
  VaultEntry,
} from "@/shared/types";
import type { TotpAccount } from "@/shared/totp";
import { CategoryFilter } from "./CategoryFilter";
import { EntryDetailModal } from "./EntryDetailModal";
import { EntryForm } from "./EntryForm";
import { Modal } from "./Modal";
import { EntryList } from "./EntryList";
import { PersonAvatar } from "./ServiceIcon";
import { FirebaseSyncModal } from "./FirebaseSyncModal";
import { formatLastSync } from "@/shared/syncTime";
import { SettingsScreen } from "./SettingsScreen";
import { AddEntryWizard } from "./wizard/AddEntryWizard";
import { TotpAddModal } from "./TotpAddModal";
import { TotpImporterModal } from "./TotpImporterModal";
import { MpinConfirmFlow } from "./MpinConfirmFlow";
import { useBackHandler } from "@/shared/backButton";
import {
  loadFirebaseSyncState,
  subscribeFirebaseSyncConfig,
  initFirebaseAuthListener,
  type FirebaseSyncConfig,
  type VaultSyncTarget,
} from "@/shared/firebaseSync";
import { AuthenticatorView } from "./AuthenticatorView";
import { UpdateModal } from "./UpdateModal";
import { checkForAppUpdates, type UpdateCheckResult } from "@/shared/updateService";

type Tab = "vault" | "authenticator" | "settings";

interface VaultScreenProps {
  entries: VaultEntry[];
  people: Person[];
  biometricsEnabled: boolean;
  biometricsAvailable: boolean;
  mpinEnabled: boolean;
  busy: boolean;
  error: string | null;
  toast: string | null;
  onLock: () => void;
  onAdd: (
    data: Omit<VaultEntry, "id" | "createdAt" | "updatedAt">,
  ) => Promise<void>;
  onUpdate: (
    id: string,
    data: Omit<VaultEntry, "id" | "createdAt" | "updatedAt">,
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onCopy: (label: string, value: string) => void;
  onAddPerson: (
    name: string,
    category: PersonCategoryId,
    emoji?: string,
  ) => Promise<Person | null>;
  onUpdatePerson: (
    id: string,
    update: { name?: string; category?: PersonCategoryId; emoji?: string },
  ) => Promise<void>;
  onDeletePerson: (id: string) => Promise<{ entriesRemoved: number }>;
  onEnableBiometrics: () => Promise<boolean>;
  onDisableBiometrics: () => Promise<boolean>;
  onSetMpin: (mpin: string, confirm: string) => Promise<boolean>;
  onRemoveMpin: () => Promise<boolean>;
  onChangeMasterPassword: (
    current: string,
    next: string,
    confirm: string,
  ) => Promise<boolean>;
  onExport: () => Promise<string>;
  onImport: (
    content: string,
    password: string,
    mode: ImportMode,
  ) => Promise<boolean>;
  onImportChromeCsv: (csv: string, personId: string) => Promise<number>;
  onMessage: (message: string) => void;
  onResetApp: () => Promise<boolean>;
  onDeleteAccount?: () => Promise<boolean>;
  onSwitchAccount?: () => Promise<boolean>;
  onRestoredVault?: () => Promise<boolean>;
  trashEntries?: TrashEntry[];
  onRestoreTrash?: (id: string) => Promise<unknown>;
  onPurgeTrash?: (id: string) => Promise<unknown>;
  onEmptyTrash?: () => Promise<unknown>;
  onImportTotp?: (accounts: TotpAccount[], personId: string) => Promise<number>;
  vaultTarget?: VaultSyncTarget;
}

export function VaultScreen(props: VaultScreenProps) {
  const [tab, setTab] = useState<Tab>("vault");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<VaultEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const [showAddChoice, setShowAddChoice] = useState(false);
  const [totpAddOpen, setTotpAddOpen] = useState(false);
  const [totpImporterOpen, setTotpImporterOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [cloudConfig, setCloudConfig] = useState<FirebaseSyncConfig | null>(null);
  const [firebaseModalOpen, setFirebaseModalOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);

  // Background update check on mobile
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const res = await checkForAppUpdates();
        if (mounted && res?.hasUpdate) {
          setUpdateInfo(res);
        }
      } catch {}
    };
    void check();
    const interval = setInterval(check, 30 * 60 * 1000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    void initFirebaseAuthListener();
    void loadFirebaseSyncState().then((cfg) => setCloudConfig(cfg));
    return subscribeFirebaseSyncConfig((cfg) => {
      setCloudConfig(cfg);
      setAvatarFailed(false);
    });
  }, []);

  const [recoveredMpinPrompt, setRecoveredMpinPrompt] = useState(false);

  useEffect(() => {
    try {
      const needed = sessionStorage.getItem("securex_recovered_needs_mpin") === "true";
      if (needed && !props.mpinEnabled) {
        setRecoveredMpinPrompt(true);
      }
    } catch {}
  }, [props.mpinEnabled]);

  useBackHandler(() => {
    if (firebaseModalOpen) {
      setFirebaseModalOpen(false);
      return true;
    }
    if (totpAddOpen) {
      setTotpAddOpen(false);
      return true;
    }
    if (showAddChoice) {
      setShowAddChoice(false);
      return true;
    }
    if (adding) {
      setAdding(false);
      return true;
    }
    if (editing) {
      setEditing(false);
      return true;
    }
    if (selected) {
      setSelected(null);
      return true;
    }
    if (tab === "settings" || tab === "authenticator") {
      setTab("vault");
      return true;
    }
    if (query || categoryFilter || personFilter) {
      setQuery("");
      setCategoryFilter(null);
      setPersonFilter(null);
      return true;
    }
    return false;
  }, true);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of props.entries) {
      const id = normalizeEntry(entry).categoryId;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  }, [props.entries]);

  const totpCount = useMemo(() => {
    return props.entries.filter((entry) => {
      const e = normalizeEntry(entry);
      return Boolean(e.totpSeed || e.categoryId === "authenticator");
    }).length;
  }, [props.entries]);

  if (adding) {
    return (
      <AddEntryWizard
        people={props.people}
        onCancel={() => setAdding(false)}
        onAddPerson={props.onAddPerson}
        onSave={async (data) => {
          await props.onAdd(data);
          setAdding(false);
          props.onMessage("Saved.");
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-row">
          <h2>{tab === "vault" ? "Vault" : tab === "authenticator" ? "Authenticator" : "Settings"}</h2>
          <div className="topbar-actions">
            {/* Update available icon with red dot next to Google account logo */}
            {updateInfo?.hasUpdate && (
              <button
                type="button"
                className="topbar-update-btn has-update"
                onClick={() => setUpdateModalOpen(true)}
                title={`Update available: v${updateInfo.latestVersion}`}
                aria-label="Update available"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6" />
                  <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-1.19" />
                </svg>
                <span className="topbar-update-dot" />
              </button>
            )}

            {props.vaultTarget && (
              <button
                type="button"
                className={`topbar-google-btn${
                  cloudConfig?.enabled ? " topbar-google-btn--connected" : ""
                }${
                  cloudConfig?.lastSyncStatus === "syncing"
                    ? " topbar-google-btn--syncing"
                    : cloudConfig?.lastSyncStatus === "error"
                      ? " topbar-google-btn--error"
                      : cloudConfig?.lastSyncStatus === "success"
                        ? " topbar-google-btn--success"
                        : ""
                }`}
                title={
                  cloudConfig?.enabled
                    ? `Google Cloud (${cloudConfig.userEmail || "Connected"})${
                        cloudConfig.lastSyncStatus === "syncing"
                          ? " - Syncing..."
                          : cloudConfig.lastSyncAt
                            ? " - Synced " + formatLastSync(cloudConfig.lastSyncAt)
                            : " - Live Connected"
                      }`
                    : "Connect Google Cloud (Firebase)"
                }
                aria-label={
                  cloudConfig?.enabled
                    ? `Google Cloud (${cloudConfig.userEmail || "Connected"})`
                    : "Connect Google Cloud (Firebase)"
                }
                onClick={() => setFirebaseModalOpen(true)}
              >
                <div className="topbar-google-avatar-wrap">
                  {cloudConfig?.enabled && cloudConfig.userPicture && !avatarFailed ? (
                    <img
                      src={cloudConfig.userPicture}
                      alt={cloudConfig.userName || "Google account"}
                      className="topbar-google-avatar"
                      referrerPolicy="no-referrer"
                      onError={() => setAvatarFailed(true)}
                    />
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                      />
                    </svg>
                  )}
                </div>
                {cloudConfig?.enabled && cloudConfig.lastSyncStatus && cloudConfig.lastSyncStatus !== "idle" && (
                  <span
                    className={`topbar-google-badge topbar-google-badge--${cloudConfig.lastSyncStatus}`}
                    aria-hidden
                  />
                )}
              </button>
            )}
            <button type="button" className="ghost small" onClick={props.onLock}>
              Lock
            </button>
          </div>
        </div>
        <p className="muted small topbar-meta">
          {props.entries.length} entries | {props.people.length} people
          {cloudConfig?.enabled && (
            <> | Cloud {cloudConfig.lastSyncAt ? formatLastSync(cloudConfig.lastSyncAt) : "Live"}</>
          )}
        </p>
      </header>

      {props.toast && <div className="toast">{props.toast}</div>}

      <main className="main-content">
        {tab === "settings" ? (
          <SettingsScreen
            people={props.people}
            biometricsEnabled={props.biometricsEnabled}
            biometricsAvailable={props.biometricsAvailable}
            mpinEnabled={props.mpinEnabled}
            busy={props.busy}
            error={props.error}
            onEnableBiometrics={props.onEnableBiometrics}
            onDisableBiometrics={props.onDisableBiometrics}
            onSetMpin={props.onSetMpin}
            onRemoveMpin={props.onRemoveMpin}
            onAddPerson={props.onAddPerson}
            onUpdatePerson={props.onUpdatePerson}
            onDeletePerson={props.onDeletePerson}
            onChangeMasterPassword={props.onChangeMasterPassword}
            onExport={props.onExport}
            onImport={props.onImport}
            onImportChromeCsv={props.onImportChromeCsv}
            onMessage={props.onMessage}
            onResetApp={props.onResetApp}
            onDeleteAccount={props.onDeleteAccount}
            trashEntries={props.trashEntries}
            onRestoreTrash={props.onRestoreTrash}
            onPurgeTrash={props.onPurgeTrash}
            onEmptyTrash={props.onEmptyTrash}
            onImportTotp={props.onImportTotp}
            onSwitchAccount={props.onSwitchAccount}
            vaultTarget={props.vaultTarget}
          />
        ) : tab === "authenticator" ? (
          <AuthenticatorView
            entries={props.entries}
            people={props.people}
            onAdd={props.onAdd}
            onUpdate={props.onUpdate}
            onDelete={props.onDelete}
            onImportTotp={props.onImportTotp}
            onMessage={props.onMessage}
            onSelectEntry={(entry) => setSelected(entry)}
          />
        ) : props.entries.length === 0 ? (
          <div className="vault-home-empty">
            <div className="dot-matrix" aria-hidden>
              {Array.from({ length: 16 }).map((_, i) => (
                <span
                  key={i}
                  className={i % 5 === 0 ? "dot dot--accent" : "dot"}
                />
              ))}
            </div>
            <h2 className="vault-home-title">Vault</h2>
            <p className="muted vault-home-sub">No passwords saved yet.</p>
            <button
              type="button"
              className="fab fab--center"
              aria-label="Add item"
              onClick={() => setShowAddChoice(true)}
            >
              <span className="fab-plus" aria-hidden />
            </button>
            <p className="label-mono vault-home-cta">ADD ITEM</p>
          </div>
        ) : (
          <>
            <input
              type="search"
              className="search"
              placeholder="Search name, person, service..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />

            <CategoryFilter
              active={categoryFilter}
              counts={categoryCounts}
              totpCount={totpCount}
              onChange={setCategoryFilter}
            />

            {props.people.length > 0 && (
              <div className="category-filter">
                <button
                  type="button"
                  className={`filter-chip${personFilter === null ? " active" : ""}`}
                  onClick={() => setPersonFilter(null)}
                >
                  Everyone
                </button>
                {props.people.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    className={`filter-chip${personFilter === person.id ? " active" : ""}`}
                    onClick={() => setPersonFilter(person.id)}
                  >
                    <PersonAvatar
                      name={person.name}
                      emoji={person.emoji}
                      color={colorForId(person.id)}
                      size="sm"
                    />
                    {person.name}
                  </button>
                ))}
              </div>
            )}

            <EntryList
              entries={props.entries}
              people={props.people}
              query={query}
              categoryFilter={categoryFilter}
              personFilter={personFilter}
              selectedId={selected?.id ?? null}
              onSelect={(entry) => setSelected(entry)}
            />

            <EntryDetailModal
              entry={editing ? null : selected}
              people={props.people}
              onClose={() => setSelected(null)}
              onEdit={() => setEditing(true)}
              onDelete={() => {
                if (!selected) return;
                const label = entryDisplayTitle(
                  normalizeEntry(selected),
                  props.people,
                );
                if (confirm(`Delete "${label}"?`)) {
                  void props.onDelete(selected.id);
                  setSelected(null);
                }
              }}
              onCopy={props.onCopy}
            />
          </>
        )}
      </main>

      {tab === "vault" && !editing && props.entries.length > 0 && (
        <button
          type="button"
          className="fab"
          aria-label="Add item"
          onClick={() => setShowAddChoice(true)}
        >
          <span className="fab-plus" aria-hidden />
        </button>
      )}

      <Modal
        title="Add to Vault"
        open={showAddChoice}
        onClose={() => setShowAddChoice(false)}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <p style={{ color: "#aaa", fontSize: "0.875rem", margin: 0 }}>
            Choose what you would like to add:
          </p>

          <button
            type="button"
            className="primary"
            style={{ padding: "0.9rem 1rem", fontSize: "0.95rem", textAlign: "left" }}
            onClick={() => {
              setShowAddChoice(false);
              setAdding(true);
            }}
          >
            🔑 <strong>Password / Login</strong>
            <div style={{ fontSize: "0.75rem", opacity: 0.8, marginTop: "0.2rem" }}>
              Standard account with username, password, and website
            </div>
          </button>

          <button
            type="button"
            className="ghost"
            style={{ padding: "0.9rem 1rem", fontSize: "0.95rem", textAlign: "left" }}
            onClick={() => {
              setShowAddChoice(false);
              setTotpAddOpen(true);
            }}
          >
            🛡️ <strong>Authenticator Code (TOTP)</strong>
            <div style={{ fontSize: "0.75rem", opacity: 0.8, marginTop: "0.2rem" }}>
              Scan QR code or enter setup key (like Google Authenticator)
            </div>
          </button>

          <button
            type="button"
            className="ghost"
            style={{ padding: "0.9rem 1rem", fontSize: "0.95rem", textAlign: "left" }}
            onClick={() => {
              setShowAddChoice(false);
              setTotpImporterOpen(true);
            }}
          >
            📲 <strong>Import from Google Authenticator / 2FA</strong>
            <div style={{ fontSize: "0.75rem", opacity: 0.8, marginTop: "0.2rem" }}>
              Scan export QR code or upload image to transfer 2FA accounts
            </div>
          </button>
        </div>
      </Modal>

      <TotpAddModal
        open={totpAddOpen}
        people={props.people}
        onClose={() => setTotpAddOpen(false)}
        onSave={props.onAdd}
        onImportTotp={props.onImportTotp}
        onMessage={props.onMessage}
      />

      <TotpImporterModal
        open={totpImporterOpen}
        people={props.people}
        onImport={async (accounts, personId) => {
          if (!props.onImportTotp) return 0;
          return await props.onImportTotp(accounts, personId);
        }}
        onClose={() => setTotpImporterOpen(false)}
        onMessage={props.onMessage}
      />

      <Modal
        title="Edit password"
        open={editing && !!selected}
        onClose={() => {
          setEditing(false);
        }}
      >
        {selected && (
          <EntryForm
            initial={selected}
            people={props.people}
            onCancel={() => setEditing(false)}
            onSave={async (data) => {
              await props.onUpdate(selected.id, data);
              setEditing(false);
              setSelected(null);
              props.onMessage("Updated.");
            }}
          />
        )}
      </Modal>

      {props.vaultTarget && (
        <FirebaseSyncModal
          open={firebaseModalOpen}
          vaultTarget={props.vaultTarget}
          onClose={() => setFirebaseModalOpen(false)}
          onMessage={props.onMessage}
          onSwitchAccount={props.onSwitchAccount ? () => { void props.onSwitchAccount?.(); } : undefined}
          onRestoredVault={props.onRestoredVault ? () => { void props.onRestoredVault?.(); } : undefined}
        />
      )}

      <UpdateModal
        open={updateModalOpen}
        onClose={() => setUpdateModalOpen(false)}
        onMessage={props.onMessage}
      />

      <Modal
        title="Set Quick Unlock MPIN"
        open={recoveredMpinPrompt}
        onClose={() => {
          try {
            sessionStorage.removeItem("securex_recovered_needs_mpin");
          } catch {}
          setRecoveredMpinPrompt(false);
        }}
      >
        <div className="stack">
          <p className="muted small">
            Your vault was recovered from your Google account. Set an 8-digit MPIN so you can quickly unlock SecureX instead of entering your Master Password every time.
          </p>
          <MpinConfirmFlow
            onComplete={async (code) => {
              const ok = await props.onSetMpin(code, code);
              if (ok) {
                try {
                  sessionStorage.removeItem("securex_recovered_needs_mpin");
                } catch {}
                setRecoveredMpinPrompt(false);
                props.onMessage("MPIN set successfully. You can now unlock using your MPIN.");
              }
            }}
          />
          <button
            type="button"
            className="ghost block"
            style={{ marginTop: "8px" }}
            onClick={() => {
              try {
                sessionStorage.removeItem("securex_recovered_needs_mpin");
              } catch {}
              setRecoveredMpinPrompt(false);
            }}
          >
            Skip for now
          </button>
        </div>
      </Modal>

      <nav className="bottom-nav" aria-label="Main">
        <div className="bottom-nav-inner">
          <div className="bottom-nav-tabs">
            <button
              type="button"
              className={`bottom-nav-tab ${tab === "vault" ? "active" : ""}`}
              onClick={() => setTab("vault")}
            >
              Vault
            </button>
            <button
              type="button"
              className={`bottom-nav-tab ${tab === "authenticator" ? "active" : ""}`}
              onClick={() => setTab("authenticator")}
            >
              Authenticator
            </button>
          </div>
          <button
            type="button"
            className={`bottom-nav-settings-btn ${tab === "settings" ? "active" : ""}`}
            onClick={() => setTab("settings")}
            aria-label="Settings"
            title="Settings"
          >
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </nav>
    </div>
  );
}
