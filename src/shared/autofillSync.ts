import { getSubcategory } from "./catalog";
import type { Person, VaultEntry } from "./types";
import { entryDisplayTitle } from "./entryUtils";
import { autofillSupported, VaultAutofill } from "./vaultAutofill";
import type { AutofillCredentialPayload } from "./vaultAutofill";

export function hostFromUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    if (host.startsWith("m.")) host = host.slice(2);
    return host || null;
  } catch {
    return null;
  }
}

function entryMatchHosts(entry: VaultEntry): string[] {
  const hosts = new Set<string>();
  const sub = getSubcategory(entry.categoryId, entry.subcategoryId);

  const url = entry.url.trim() || sub?.defaultUrl || "";
  const urlHost = hostFromUrl(url);
  if (urlHost) hosts.add(urlHost);

  for (const host of sub?.hosts ?? []) {
    hosts.add(host.toLowerCase());
  }

  return [...hosts];
}

export function entriesToAutofillCredentials(
  entries: VaultEntry[],
  people: Person[],
): AutofillCredentialPayload[] {
  return entries
    .filter((e) => e.username || e.password)
    .map((e) => {
      const sub = getSubcategory(e.categoryId, e.subcategoryId);
      const url = e.url.trim() || sub?.defaultUrl || "";
      return {
        id: e.id,
        username: e.username,
        password: e.password,
        url,
        title: entryDisplayTitle(e, people),
        matchHosts: entryMatchHosts(e),
      };
    });
}

export async function syncAutofillSession(
  entries: VaultEntry[],
  people: Person[],
): Promise<void> {
  if (!autofillSupported()) return;

  const credentials = entriesToAutofillCredentials(entries, people);
  await VaultAutofill.syncCredentials({ credentials });
  await VaultAutofill.setSessionActive({ active: true });
  await VaultAutofill.notifyUnlocked();
}

export async function clearAutofillSession(): Promise<void> {
  if (!autofillSupported()) return;
  await VaultAutofill.clearSession();
}
