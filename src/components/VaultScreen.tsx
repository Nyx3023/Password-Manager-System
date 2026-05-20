import { useMemo, useState } from "react";
import { entryDisplayTitle, normalizeEntry } from "@/shared/entryUtils";
import { colorForId } from "@/shared/people";
import type {
  ImportMode,
  Person,
  PersonCategoryId,
  VaultEntry,
} from "@/shared/types";
import { CategoryFilter } from "./CategoryFilter";
import { EntryDetailModal } from "./EntryDetailModal";
import { EntryForm } from "./EntryForm";
import { Modal } from "./Modal";
import { EntryList } from "./EntryList";
import { PersonAvatar } from "./ServiceIcon";
import { LanSyncModal } from "./LanSyncModal";
import { formatLastSync } from "@/shared/syncTime";
import { SyncIcon, type SyncIconState } from "./SyncIcon";
import { SettingsScreen } from "./SettingsScreen";
import { AddEntryWizard } from "./wizard/AddEntryWizard";
import type { DesktopLanPanelProps } from "@/desktop/DesktopLanPanel";

type Tab = "vault" | "settings";

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
  onPullFromPc?: (
    host: string,
    port: number,
  ) => Promise<{ ok: boolean; message: string }>;
  onPushToPc?: (
    host: string,
    port: number,
    force?: boolean,
  ) => Promise<{ ok: boolean; message: string }>;
  desktopLan?: DesktopLanPanelProps;
  syncVisual?: SyncIconState;
  lastSyncAt?: string | null;
  onSyncVisual?: (state: SyncIconState, revertMs?: number) => void;
}

export function VaultScreen(props: VaultScreenProps) {
  const [tab, setTab] = useState<Tab>("vault");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<VaultEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [lanSyncOpen, setLanSyncOpen] = useState(false);
  const [modalSyncVisual, setModalSyncVisual] = useState<SyncIconState>("idle");
  const syncVisual = props.syncVisual ?? modalSyncVisual;
  const setSyncVisual = props.onSyncVisual ?? setModalSyncVisual;

  const showLanSync = Boolean(props.onPullFromPc && props.onPushToPc);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of props.entries) {
      const id = normalizeEntry(entry).categoryId;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
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
          <h2>{tab === "vault" ? "Vault" : "Settings"}</h2>
          <div className="topbar-actions">
            {showLanSync && tab === "vault" && (
              <button
                type="button"
                className={`topbar-icon-btn topbar-sync-btn${
                  syncVisual === "success"
                    ? " topbar-sync-btn--success"
                    : syncVisual === "error"
                      ? " topbar-sync-btn--error"
                      : ""
                }`}
                aria-label="Sync with PC"
                onClick={() => {
                  setSyncVisual("idle");
                  setLanSyncOpen(true);
                }}
              >
                <SyncIcon state={syncVisual} />
              </button>
            )}
            <button type="button" className="ghost small" onClick={props.onLock}>
              Lock
            </button>
          </div>
        </div>
        <p className="muted small topbar-meta">
          {props.entries.length} entries | {props.people.length} people
          {showLanSync && props.lastSyncAt !== undefined && (
            <> | Sync {formatLastSync(props.lastSyncAt)}</>
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
            onPullFromPc={props.onPullFromPc}
            onPushToPc={props.onPushToPc}
            onOpenLanSync={props.onPullFromPc ? () => setLanSyncOpen(true) : undefined}
            lanLastSyncAt={props.lastSyncAt}
            desktopLan={props.desktopLan}
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
              aria-label="Add entry"
              onClick={() => setAdding(true)}
            >
              <span className="fab-plus" aria-hidden />
            </button>
            <p className="label-mono vault-home-cta">ADD PASSWORD</p>
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
          aria-label="Add entry"
          onClick={() => setAdding(true)}
        >
          <span className="fab-plus" aria-hidden />
        </button>
      )}

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

      {showLanSync && props.onPullFromPc && props.onPushToPc && (
        <LanSyncModal
          open={lanSyncOpen}
          busy={props.busy}
          onClose={() => setLanSyncOpen(false)}
          onSyncVisual={setSyncVisual}
          onPull={props.onPullFromPc}
          onPush={props.onPushToPc}
          onMessage={props.onMessage}
        />
      )}

      <nav className="bottom-nav" aria-label="Main">
        <div className="bottom-nav-inner">
          <button
            type="button"
            className={tab === "vault" ? "active" : ""}
            onClick={() => setTab("vault")}
          >
            Vault
          </button>
          <button
            type="button"
            className={tab === "settings" ? "active" : ""}
            onClick={() => setTab("settings")}
          >
            Settings
          </button>
        </div>
      </nav>
    </div>
  );
}
