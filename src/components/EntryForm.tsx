import { FormEvent, useEffect, useState } from "react";
import { PasswordGeneratorPanel } from "./PasswordGeneratorPanel";
import { normalizeEntry, suggestedTitle } from "@/shared/entryUtils";
import { colorForId, groupPeopleByCategory } from "@/shared/people";
import type { Person, VaultEntry } from "@/shared/types";
import { PersonAvatar, ServiceIcon } from "./ServiceIcon";
import { getSubcategory } from "@/shared/catalog";

interface EntryFormProps {
  initial: VaultEntry;
  people: Person[];
  onSave: (
    data: Omit<VaultEntry, "id" | "createdAt" | "updatedAt">,
  ) => Promise<void>;
  onCancel: () => void;
}

export function EntryForm({
  initial,
  people,
  onSave,
  onCancel,
}: EntryFormProps) {
  const e = normalizeEntry(initial);
  const [form, setForm] = useState({
    title: e.title,
    personId: e.personId,
    categoryId: e.categoryId,
    subcategoryId: e.subcategoryId,
    username: e.username,
    password: e.password,
    url: e.url,
    notes: e.notes,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const ne = normalizeEntry(initial);
    setForm({
      title: ne.title,
      personId: ne.personId,
      categoryId: ne.categoryId,
      subcategoryId: ne.subcategoryId,
      username: ne.username,
      password: ne.password,
      url: ne.url,
      notes: ne.notes,
    });
  }, [initial]);

  const sub = getSubcategory(form.categoryId, form.subcategoryId);
  const personGroups = groupPeopleByCategory(people);
  const person = people.find((p) => p.id === form.personId);
  const generatorUser = form.username.trim() || person?.name || "";

  const handleSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    setSaving(true);
    try {
      const person = people.find((p) => p.id === form.personId);
      const personName = person?.name ?? e.personName ?? "";
      const title =
        form.title.trim() ||
        suggestedTitle(form.categoryId, form.subcategoryId, personName);
      await onSave({ ...form, personName, title });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="entry-form stack" onSubmit={handleSubmit}>
      <div className="panel-header">
        <h3>Edit entry</h3>
        <button type="button" className="ghost small" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <div className="edit-summary panel-inner">
        <ServiceIcon
          categoryId={form.categoryId}
          subcategoryId={form.subcategoryId}
          size="lg"
        />
        <div>
          <strong>{sub?.name ?? "Service"}</strong>
          <p className="muted small">Change person below to reassign.</p>
        </div>
      </div>

      <label>
        Person
        <select
          value={form.personId}
          onChange={(ev) =>
            setForm((f) => ({ ...f, personId: ev.target.value }))
          }
        >
          <option value="">- None -</option>
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

      <label>
        Custom label (optional)
        <input
          value={form.title}
          onChange={(ev) => setForm((f) => ({ ...f, title: ev.target.value }))}
          placeholder="Auto from service + person"
        />
      </label>

      <label>
        Username / email
        <input
          value={form.username}
          onChange={(ev) =>
            setForm((f) => ({ ...f, username: ev.target.value }))
          }
        />
      </label>

      <label>
        Password
        <div className="inline-input">
          <input
            type={showPassword ? "text" : "password"}
            value={form.password}
            onChange={(ev) =>
              setForm((f) => ({ ...f, password: ev.target.value }))
            }
            required
          />
          <button
            type="button"
            className="ghost small"
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </label>

      <button
        type="button"
        className="ghost block"
        onClick={() => setShowGenerator((v) => !v)}
      >
        {showGenerator ? "Hide generator" : "Generate password"}
      </button>

      {showGenerator && (
        <PasswordGeneratorPanel
          websiteLabel={sub?.name ?? "Website"}
          userLabel={generatorUser}
          onUse={(password) => {
            setForm((f) => ({ ...f, password }));
            setShowGenerator(false);
          }}
        />
      )}

      <label>
        Website
        <input
          value={form.url}
          onChange={(ev) => setForm((f) => ({ ...f, url: ev.target.value }))}
          placeholder="https://"
          inputMode="url"
        />
      </label>

      <label>
        Notes
        <textarea
          value={form.notes}
          onChange={(ev) => setForm((f) => ({ ...f, notes: ev.target.value }))}
          rows={3}
        />
      </label>

      <button type="submit" className="primary block" disabled={saving}>
        {saving ? "Saving..." : "Save changes"}
      </button>

      {/* Show the resolved person preview for confirmation */}
      {form.personId && (
        <div className="muted small person-preview">
          {(() => {
            const p = people.find((x) => x.id === form.personId);
            if (!p) return null;
            return (
              <>
                <PersonAvatar
                  name={p.name}
                  emoji={p.emoji}
                  color={colorForId(p.id)}
                  size="sm"
                />
                For {p.name}
              </>
            );
          })()}
        </div>
      )}
    </form>
  );
}
