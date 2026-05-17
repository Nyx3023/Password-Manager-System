import { matchServiceByUrl } from "./catalog";

export interface ChromeRow {
  name: string;
  url: string;
  username: string;
  password: string;
  note: string;
}

/**
 * Robust CSV parser that handles quoted fields with embedded commas/newlines/quotes.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  // Strip UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
      continue;
    }
    cell += ch;
    i++;
  }
  // flush last cell / row
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r[0] && r[0].length > 0));
}

/**
 * Parse Chrome's "Password Manager" CSV export.
 * Header is `name,url,username,password,note` (older versions omit `note`).
 */
export function parseChromeCsv(text: string): ChromeRow[] {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    throw new Error("CSV file is empty.");
  }

  const header = rows[0]!.map((c) => c.trim().toLowerCase());
  const idx = {
    name: header.indexOf("name"),
    url: header.indexOf("url"),
    username: header.indexOf("username"),
    password: header.indexOf("password"),
    note: header.indexOf("note"),
  };

  if (idx.url < 0 || idx.username < 0 || idx.password < 0) {
    throw new Error(
      "This does not look like a Chrome password export. Expected columns: name, url, username, password.",
    );
  }

  const result: ChromeRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r]!;
    const row: ChromeRow = {
      name: (cols[idx.name] ?? "").trim(),
      url: (cols[idx.url] ?? "").trim(),
      username: (cols[idx.username] ?? "").trim(),
      password: cols[idx.password] ?? "",
      note: idx.note >= 0 ? (cols[idx.note] ?? "").trim() : "",
    };
    if (!row.password && !row.username && !row.url && !row.name) continue;
    result.push(row);
  }
  return result;
}

export interface PreparedChromeEntry {
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  categoryId: string;
  subcategoryId: string;
}

/** Convert a parsed Chrome CSV row into a VaultEntry-shaped object (minus id/dates/personId). */
export function chromeRowToEntry(row: ChromeRow): PreparedChromeEntry {
  const match = matchServiceByUrl(row.url);
  const baseTitle = row.name?.trim() || hostFromUrl(row.url) || "Imported";
  return {
    title: baseTitle,
    username: row.username,
    password: row.password,
    url: row.url,
    notes: row.note,
    categoryId: match.categoryId,
    subcategoryId: match.subcategoryId,
  };
}

function hostFromUrl(url: string): string {
  try {
    const normalized = url.includes("://") ? url : `https://${url}`;
    return new URL(normalized).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
