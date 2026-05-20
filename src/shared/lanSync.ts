import { lanHttpAvailable, lanHttpRequest } from "./vaultLanHttp";

const PREFS_HOST = "lan_sync_host";
const PREFS_PORT = "lan_sync_port";
const PREFS_PAIRED = "lan_sync_paired";
const PREFS_VAULT_ETAG = "lan_sync_vault_etag";
const PREFS_LAST_SYNC = "lan_sync_last_at";

export interface LanServerStatus {
  running: boolean;
  port: number;
  address: string;
  vaultEtag?: string | null;
  lastSyncAt: string | null;
}

export interface LanSyncResult {
  ok: boolean;
  message: string;
  etag?: string;
}

export interface PcConnection {
  host: string;
  port: number;
  status: LanServerStatus;
}

/** Split host field; strips protocol, path, and optional :port. */
export function parseLanEndpoint(
  hostInput: string,
  portInput: string | number,
): { host: string; port: number } {
  let raw = hostInput.trim();
  if (!raw) return { host: "", port: Number(portInput) || 9847 };

  raw = raw.replace(/^https?:\/\//i, "");
  raw = raw.split("/")[0] ?? raw;
  raw = raw.split("?")[0] ?? raw;
  raw = raw.replace(/\/+$/, "");

  let port = Number(portInput) || 9847;
  const match = raw.match(/^([^:/]+):(\d+)$/);
  if (match) {
    raw = match[1]!.trim();
    port = Number(match[2]) || port;
  }

  return { host: raw, port };
}

export function validateLanEndpoint(
  host: string,
  port: number,
): string | null {
  if (!host.trim()) {
    return "Enter the PC IP address (example: 192.168.1.42).";
  }
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host.trim())) {
    return "Enter a valid IPv4 address for the PC.";
  }
  if (port < 1 || port > 65535) {
    return "Port must be between 1 and 65535.";
  }
  return null;
}

function baseUrl(host: string, port: number): string {
  return `http://${host.trim()}:${port}`;
}

export function loadLanPrefs(): { host: string; port: number } {
  return {
    host: localStorage.getItem(PREFS_HOST) ?? "",
    port: Number(localStorage.getItem(PREFS_PORT) ?? "9847") || 9847,
  };
}

export function saveLanPrefs(host: string, port: number): void {
  localStorage.setItem(PREFS_HOST, host.trim());
  localStorage.setItem(PREFS_PORT, String(port));
}

export function markLanPaired(host: string, port: number): void {
  saveLanPrefs(host, port);
  localStorage.setItem(PREFS_PAIRED, "1");
}

export function isLanPaired(): boolean {
  const prefs = loadLanPrefs();
  return (
    localStorage.getItem(PREFS_PAIRED) === "1" &&
    !!prefs.host &&
    /^\d{1,3}(\.\d{1,3}){3}$/.test(prefs.host)
  );
}

let lastEtag: string | null = null;

export function getLastSyncEtag(): string | null {
  return lastEtag ?? loadStoredVaultEtag();
}

export function loadStoredVaultEtag(): string | null {
  return localStorage.getItem(PREFS_VAULT_ETAG);
}

export function storeVaultEtag(etag: string | null | undefined): void {
  if (!etag) return;
  lastEtag = etag;
  localStorage.setItem(PREFS_VAULT_ETAG, etag);
}

export function clearLastSyncEtag(): void {
  lastEtag = null;
  localStorage.removeItem(PREFS_VAULT_ETAG);
}

export function loadLastSyncAt(): string | null {
  return localStorage.getItem(PREFS_LAST_SYNC);
}

export function storeLastSyncAt(iso?: string): string {
  const value = iso ?? new Date().toISOString();
  localStorage.setItem(PREFS_LAST_SYNC, value);
  return value;
}

export async function fetchPcStatus(
  host: string,
  port: number,
): Promise<LanServerStatus> {
  const validation = validateLanEndpoint(host, port);
  if (validation) {
    throw new Error(validation);
  }

  const res = await lanHttpRequest({
    url: `${baseUrl(host, port)}/api/status`,
    method: "GET",
  });
  if (res.status !== 200) {
    throw new Error(parseError(res.data) || "Could not reach PC.");
  }
  return JSON.parse(res.data) as LanServerStatus;
}

function isPcLanServerReady(st: LanServerStatus): boolean {
  if (st.running === true) return true;
  // A 200 from /api/status on our desktop host always includes address (ip:port).
  return typeof st.address === "string" && st.address.includes(":");
}

export async function connectToPc(
  host: string,
  port: number,
): Promise<PcConnection> {
  const st = await fetchPcStatus(host, port);
  if (!isPcLanServerReady(st)) {
    throw new Error(
      "PC LAN server is off. On the desktop app open Settings and tap Start LAN server.",
    );
  }
  return {
    host: host.trim(),
    port,
    status: { ...st, running: true },
  };
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
}): Promise<{ content: string; etag: string | null }> {
  if (!lanHttpAvailable()) {
    throw new Error("LAN sync requires the Android app.");
  }

  const validation = validateLanEndpoint(options.host, options.port);
  if (validation) {
    throw new Error(validation);
  }

  const res = await lanHttpRequest({
    url: `${baseUrl(options.host, options.port)}/api/vault`,
    method: "GET",
  });

  if (res.status === 404) {
    throw new Error(
      "No vault on the PC yet. Push from the phone first or create a vault on the PC.",
    );
  }
  if (res.status !== 200) {
    throw new Error(parseError(res.data) || `Pull failed (${res.status}).`);
  }

  const etag = res.headers.etag ?? res.headers["etag"] ?? null;
  storeVaultEtag(etag);
  return { content: res.data, etag };
}

export async function pushVaultToPc(options: {
  host: string;
  port: number;
  vaultJson: string;
  force?: boolean;
}): Promise<LanSyncResult> {
  if (!lanHttpAvailable()) {
    return { ok: false, message: "LAN sync requires the Android app." };
  }

  const validation = validateLanEndpoint(options.host, options.port);
  if (validation) {
    return { ok: false, message: validation };
  }

  const headers: Record<string, string> = {
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
    storeVaultEtag(body.etag);
  } catch {
    /* ignore */
  }

  return { ok: true, message: "Vault merged on PC." };
}
