import { useState } from "react";
import { pickCsvFile } from "@/shared/transfer";
import { parseChromeCsv } from "@/shared/chromeCsv";
import { groupPeopleByCategory } from "@/shared/people";
import type { Person } from "@/shared/types";

interface CsvImporterProps {
  people: Person[];
  busy: boolean;
  onImport: (csv: string, personId: string) => Promise<number>;
  onMessage: (message: string) => void;
}

export function CsvImporter({
  people,
  busy,
  onImport,
  onMessage,
}: CsvImporterProps) {
  const [csv, setCsv] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [personId, setPersonId] = useState<string>(people[0]?.id ?? "");

  const groups = groupPeopleByCategory(people);

  const handlePick = async () => {
    try {
      const content = await pickCsvFile();
      const rows = parseChromeCsv(content);
      setCsv(content);
      setCount(rows.length);
      onMessage(`Found ${rows.length} entries in CSV.`);
    } catch (e) {
      setCsv(null);
      setCount(0);
      onMessage(e instanceof Error ? e.message : "Could not read CSV.");
    }
  };

  const handleImport = async () => {
    if (!csv || !personId) return;
    const imported = await onImport(csv, personId);
    if (imported > 0) {
      onMessage(`Imported ${imported} passwords.`);
      setCsv(null);
      setCount(0);
    }
  };

  return (
    <section className="panel">
      <h3>Import from Chrome</h3>
      <p className="muted small">
        In Chrome: <strong>Settings → Autofill → Password Manager → ⋮ → Export passwords</strong>.
        Transfer the CSV file to your phone, then pick it here.
      </p>

      {people.length === 0 ? (
        <p className="muted small">
          Add at least one person first. Chrome CSV will be saved under their name.
        </p>
      ) : (
        <>
          <button
            type="button"
            className="ghost block"
            disabled={busy}
            onClick={() => void handlePick()}
          >
            📂 Choose CSV file
          </button>

          {csv && (
            <>
              <p className="muted small">
                Found <strong>{count}</strong> entries. Assign them to:
              </p>
              <label>
                Save under person
                <select
                  value={personId}
                  onChange={(e) => setPersonId(e.target.value)}
                >
                  {groups.map((group) => (
                    <optgroup
                      key={group.category.id}
                      label={group.category.name}
                    >
                      {group.people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <button
                type="button"
                className="primary block"
                disabled={busy || !personId}
                onClick={() => void handleImport()}
              >
                Import {count} passwords
              </button>
            </>
          )}
        </>
      )}

      <p className="muted small warning">
        ⚠️ After importing, <strong>delete the CSV file</strong> from your phone
        and from Chrome. It contains plain-text passwords.
      </p>
    </section>
  );
}
