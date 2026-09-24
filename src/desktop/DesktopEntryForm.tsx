import { useState, useEffect, FormEvent } from "react";
import {
  CATEGORIES,
  getSubcategory,
  DEFAULT_CATEGORY_ID,
  DEFAULT_SUBCATEGORY_ID,
} from "@/shared/catalog";
import { suggestedTitle } from "@/shared/entryUtils";
import { colorForId, groupPeopleByCategory } from "@/shared/people";
import type { Person, PersonCategoryId, VaultEntry } from "@/shared/types";
import { PersonAvatar, ServiceIcon } from "@/components/ServiceIcon";
import { PasswordGeneratorPanel } from "@/components/PasswordGeneratorPanel";
import { TotpDisplay } from "@/components/TotpDisplay";

interface DesktopEntryFormProps {
  initial?: VaultEntry;
  people: Person[];
  onCancel: () => void;
  onAddPerson: (
    name: string,
    category: PersonCategoryId,
    emoji?: string,
  ) => Promise<Person | null>;
  onSave: (
    data: Omit<VaultEntry, "id" | "createdAt" | "updatedAt">,
  ) => Promise<void>;
}

export function DesktopEntryForm({
  initial,
  people,
  onCancel,
  onSave,
}: DesktopEntryFormProps) {
  const [personId, setPersonId] = useState(initial?.personId ?? "");
  const [categoryId, setCategoryId] = useState(
    initial?.categoryId ?? DEFAULT_CATEGORY_ID,
  );
  const [subcategoryId, setSubcategoryId] = useState(
    initial?.subcategoryId ?? DEFAULT_SUBCATEGORY_ID,
  );

  const [form, setForm] = useState({
    title: initial?.title ?? "",
    username: initial?.username ?? "",
    password: initial?.password ?? "",
    url: initial?.url ?? "",
    notes: initial?.notes ?? "",
    totpSeed: initial?.totpSeed ?? "",
    customFields: initial?.customFields ?? [],
  });

  const [entryType, setEntryType] = useState<"password" | "totp">(
    initial?.categoryId === "authenticator" || (Boolean(initial?.totpSeed) && !initial?.password)
      ? "totp"
      : "password"
  );
  const [showPassword, setShowPassword] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedCategory = CATEGORIES.find((c) => c.id === categoryId);
  const subcategories = selectedCategory?.subcategories ?? [];

  useEffect(() => {
    const cat = CATEGORIES.find((c) => c.id === categoryId);
    if (cat && cat.subcategories.length > 0) {
      setSubcategoryId(cat.subcategories[0]!.id);
    } else {
      setSubcategoryId(DEFAULT_SUBCATEGORY_ID);
    }
  }, [categoryId]);

  const sub = getSubcategory(categoryId, subcategoryId);
  const personGroups = groupPeopleByCategory(people);
  const person = people.find((p) => p.id === personId);
  const generatorUser = form.username.trim() || person?.name || "";
  const canSave = Boolean(
    personId &&
      (entryType === "totp" ? form.totpSeed.trim() : form.password.trim()),
  );

  useEffect(() => {
    if (!initial && sub?.defaultUrl) {
      setForm((f) => ({ ...f, url: sub.defaultUrl || "" }));
    } else if (!initial) {
      setForm((f) => ({ ...f, url: "" }));
    }
  }, [sub, initial]);

  const handleSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!canSave) return;

    setSaving(true);
    try {
      const personName = person?.name ?? "";
      let title = form.title.trim();
      if (!title) {
        if (entryType === "totp") {
          title = form.username
            ? `${sub?.name || "2FA"} (${form.username})`
            : sub?.name || "2FA Account";
        } else {
          title = suggestedTitle(categoryId, subcategoryId, personName);
        }
      }

      await onSave({
        title,
        personId,
        personName,
        categoryId: entryType === "totp" ? "authenticator" : categoryId,
        subcategoryId: entryType === "totp" ? "totp" : subcategoryId,
        username: form.username,
        password: entryType === "totp" ? "" : form.password,
        url: form.url,
        notes: form.notes,
        totpSeed: form.totpSeed.trim().toUpperCase(),
        customFields: initial ? form.customFields : [],
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="desktop-add-entry" onSubmit={handleSubmit}>
      <div className="desktop-add-entry__scroll">
        {!initial && (
          <div style={{ display: "flex", gap: "8px", marginBottom: "1rem" }}>
            <button
              type="button"
              className={entryType === "password" ? "primary small" : "ghost small"}
              style={{ flex: 1, padding: "8px 12px", fontSize: "0.85rem" }}
              onClick={() => {
                setEntryType("password");
                setCategoryId(DEFAULT_CATEGORY_ID);
              }}
            >
              🔑 Password / Login
            </button>
            <button
              type="button"
              className={entryType === "totp" ? "primary small" : "ghost small"}
              style={{ flex: 1, padding: "8px 12px", fontSize: "0.85rem" }}
              onClick={() => {
                setEntryType("totp");
                setCategoryId("authenticator");
                setSubcategoryId("totp");
              }}
            >
              🛡️ Authenticator (TOTP)
            </button>
          </div>
        )}

        {entryType === "totp" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="desktop-add-entry__hero">
              <ServiceIcon categoryId="authenticator" subcategoryId="totp" size="lg" />
              <div className="desktop-add-entry__hero-text">
                <p className="desktop-add-entry__title">
                  {form.title.trim() || "Authenticator Code (2FA)"}
                </p>
                <p className="muted small">
                  {person ? `Owner: ${person.name}` : "Enter account details and setup key"}
                </p>
              </div>
              {person && (
                <PersonAvatar
                  name={person.name}
                  emoji={person.emoji}
                  color={colorForId(person.id)}
                  size="md"
                />
              )}
            </div>

            <div className="desktop-add-entry__row desktop-add-entry__row--2">
              <label>
                Service / Issuer
                <input
                  value={form.title}
                  onChange={(ev) => setForm((f) => ({ ...f, title: ev.target.value }))}
                  placeholder="e.g. Google, GitHub, Amazon"
                  autoFocus
                />
              </label>
              <label>
                Account / Username
                <input
                  value={form.username}
                  onChange={(ev) => setForm((f) => ({ ...f, username: ev.target.value }))}
                  placeholder="e.g. user@example.com"
                />
              </label>
            </div>

            <div className="desktop-add-entry__row desktop-add-entry__row--2">
              <label>
                Setup Key (Base32 secret)
                <input
                  value={form.totpSeed}
                  required
                  onChange={(ev) =>
                    setForm((f) => ({
                      ...f,
                      totpSeed: ev.target.value.replace(/\s/g, "").toUpperCase(),
                    }))
                  }
                  placeholder="e.g. JBSWY3DPEHPK3PXP"
                  style={{ fontFamily: "monospace", letterSpacing: "0.05em" }}
                />
              </label>
              <label>
                Owner
                <select
                  value={personId}
                  onChange={(ev) => setPersonId(ev.target.value)}
                  required
                  disabled={people.length === 0}
                >
                  <option value="" disabled>
                    {people.length === 0 ? "No people" : "Select owner"}
                  </option>
                  {personGroups.map((group) => (
                    <optgroup key={group.category.id} label={group.category.name}>
                      {group.people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            </div>

            {form.totpSeed && (
              <div style={{ marginTop: "0.25rem" }}>
                <TotpDisplay
                  secret={form.totpSeed.replace(/\s/g, "").toUpperCase()}
                  label="Live Code Preview"
                />
              </div>
            )}

            <label>
              Notes (optional)
              <input
                value={form.notes}
                onChange={(ev) => setForm((f) => ({ ...f, notes: ev.target.value }))}
                placeholder="Optional notes"
              />
            </label>
          </div>
        ) : (
          <>
            <div className="desktop-add-entry__hero">
              <ServiceIcon
                categoryId={categoryId}
                subcategoryId={subcategoryId}
                size="lg"
              />
              <div className="desktop-add-entry__hero-text">
                <p className="desktop-add-entry__title">{sub?.name ?? "Service"}</p>
                <p className="muted small">
                  {person
                    ? `Owner: ${person.name}`
                    : people.length === 0
                      ? "Add people in Settings first"
                      : "Pick category, service, and owner"}
                </p>
              </div>
              {person && (
                <PersonAvatar
                  name={person.name}
                  emoji={person.emoji}
                  color={colorForId(person.id)}
                  size="md"
                />
              )}
            </div>

            <div className="desktop-add-entry__row desktop-add-entry__row--3">
              <label>
                Category
                <select
                  value={categoryId}
                  onChange={(ev) => setCategoryId(ev.target.value)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.emoji} {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Service
                <select
                  value={subcategoryId}
                  onChange={(ev) => setSubcategoryId(ev.target.value)}
                >
                  {subcategories.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.emoji} {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Owner
                <select
                  value={personId}
                  onChange={(ev) => setPersonId(ev.target.value)}
                  required
                  disabled={people.length === 0}
                >
                  <option value="" disabled>
                    {people.length === 0 ? "No people" : "Select"}
                  </option>
                  {personGroups.map((group) => (
                    <optgroup key={group.category.id} label={group.category.name}>
                      {group.people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            </div>

            <label>
              Label (optional)
              <input
                value={form.title}
                onChange={(ev) => setForm((f) => ({ ...f, title: ev.target.value }))}
                placeholder={
                  sub && person ? `${sub.name} (${person.name})` : "Custom name"
                }
              />
            </label>

            <div className="desktop-add-entry__row desktop-add-entry__row--2">
              <label>
                Username / Email
                <input
                  value={form.username}
                  onChange={(ev) =>
                    setForm((f) => ({ ...f, username: ev.target.value }))
                  }
                  autoComplete="username"
                />
              </label>

              <label>
                Password
                <div className="desktop-password-field">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(ev) =>
                      setForm((f) => ({ ...f, password: ev.target.value }))
                    }
                    required={entryType === "password"}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="ghost small desktop-password-btn"
                    onClick={() => setShowPassword((p) => !p)}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    className="ghost small desktop-password-btn"
                    onClick={() => setShowGenerator((g) => !g)}
                  >
                    Generate
                  </button>
                </div>
              </label>
            </div>

            {showGenerator && (
              <div className="desktop-generator-pop">
                <PasswordGeneratorPanel
                  websiteLabel={sub?.name ?? "Website"}
                  userLabel={generatorUser}
                  onUse={(pwd: string) => {
                    setForm((f) => ({ ...f, password: pwd }));
                    setShowGenerator(false);
                  }}
                />
              </div>
            )}

            <div className="desktop-add-entry__row desktop-add-entry__row--2">
              <label>
                URL
                <input
                  value={form.url}
                  onChange={(ev) => setForm((f) => ({ ...f, url: ev.target.value }))}
                  placeholder="https://"
                  inputMode="url"
                  autoComplete="off"
                />
              </label>
              <label>
                Notes
                <input
                  value={form.notes}
                  onChange={(ev) =>
                    setForm((f) => ({ ...f, notes: ev.target.value }))
                  }
                  placeholder="Optional"
                />
              </label>
            </div>

          </>
        )}
      </div>

      <footer className="desktop-add-entry__actions">
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={saving || !canSave}>
          {saving
            ? "Saving..."
            : initial
              ? "Save changes"
              : entryType === "totp"
                ? "Add 2FA account"
                : "Add entry"}
        </button>
      </footer>
    </form>
  );
}
