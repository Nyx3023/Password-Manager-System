import { lanHttpAvailable, lanHttpRequest } from "./vaultLanHttp";

const PREFS_HOST = "lan_sync_host";
const PREFS_PORT = "lan_sync_port";

export interface LanServerStatus {
  running: boolean;
  port: number;
  address: string;
  pairingCode: string | null;
  lastSyncAt: string | null;
}

export interface LanSyncResult {
  ok: boolean;
  message: string;
  etag?: string;
}

function normalizeHost(input: string): string {
  return input.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

function baseUrl(host: string, port: number): string {
  const h = normalizeHost(host);
  return `http://${h}:${port}`;
}

function authHeaders(pairingCode: string): Record<string, string> {
  return {
    "X-Sync-Token": pairingCode.trim(),
    Authorization: `Bearer ${pairingCode.trim()}`,
  };
}

export function loadLanPrefs(): { host: string; port: number; code: string } {
  return {
    host: localStorage.getItem(PREFS_HOST) ?? "",
    port: Number(localStorage.getItem(PREFS_PORT) ?? "9847") || 9847,
    code: localStorage.getItem("lan_sync_code") ?? "",
  };
}

export function saveLanPrefs(host: string, port: number, code: string): void {
  localStorage.setItem(PREFS_HOST, host);
  localStorage.setItem(PREFS_PORT, String(port));
  localStorage.setItem("lan_sync_code", code);
}

let lastEtag: string | null = null;

export function getLastSyncEtag(): string | null {
  return lastEtag;
}

export function clearLastSyncEtag(): void {
  lastEtag = null;
}

export async function fetchPcStatus(
  host: string,
  port: number,
): Promise<LanServerStatus> {
  const res = await lanHttpRequest({
    url: `${baseUrl(host, port)}/api/status`,
    method: "GET",
  });
  if (res.status !== 200) {
    throw new Error(parseError(res.data) || "Could not reach PC.");
  }
  return JSON.parse(res.data) as LanServerStatus;
}

function parseError(data: string): string | null {
  try {
    const obj = JSON.parse(data) as { error?: string };
    return obj.error ?? null;
  } catch {
    return data.trim() || null;
  }
}

export async function pullVaultFromPc(options: {
  host: string;
  port: number;
  pairingCode: string;
}): Promise<{ content: string; etag: string | null }> {
  if (!lanHttpAvailable()) {
    throw new Error("LAN sync requires the Android app.");
  }

  const res = await lanHttpRequest({
    url: `${baseUrl(options.host, options.port)}/api/vault`,
    method: "GET",
    headers: authHeaders(options.pairingCode),
  });

  if (res.status === 401) {
    throw new Error(parseError(res.data) || "Invalid pairing code.");
  }
  if (res.status === 404) {
    throw new Error("No vault on the PC yet. Push from the phone first or create a vault on the PC.");
  }
  if (res.status !== 200) {
    throw new Error(parseError(res.data) || `Pull failed (${res.status}).`);
  }

  const etag = res.headers.etag ?? res.headers["etag"] ?? null;
  lastEtag = etag;
  return { content: res.data, etag };
}

export async function pushVaultToPc(options: {
  host: string;
  port: number;
  pairingCode: string;
  vaultJson: string;
  force?: boolean;
}): Promise<LanSyncResult> {
  if (!lanHttpAvailable()) {
    return { ok: false, message: "LAN sync requires the Android app." };
  }

  const headers: Record<string, string> = {
    ...authHeaders(options.pairingCode),
    "Content-Type": "application/json",
  };
  if (!options.force && lastEtag) {
    headers["If-Match"] = lastEtag;
  }

  const res = await lanHttpRequest({
    url: `${baseUrl(options.host, options.port)}/api/vault`,
    method: "PUT",
    headers,
    body: options.vaultJson,
  });

  if (res.status === 401) {
    return { ok: false, message: parseError(res.data) || "Invalid pairing code." };
  }
  if (res.status === 409) {
    return {
      ok: false,
      message:
        parseError(res.data) ||
        "PC vault changed. Pull from PC first, or use force push.",
    };
  }
  if (res.status !== 200) {
    return {
      ok: false,
      message: parseError(res.data) || `Push failed (${res.status}).`,
    };
  }

  try {
    const body = JSON.parse(res.data) as { etag?: string };
    if (body.etag) lastEtag = body.etag;
  } catch {
    /* ignore */
  }

  return { ok: true, message: "Vault sent to PC." };
}

