import { registerPlugin } from "@capacitor/core";
import { isCapacitorNative } from "./platform";

export interface LanHttpResponse {
  status: number;
  headers: Record<string, string>;
  data: string;
}

export interface VaultLanHttpPlugin {
  request(options: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string;
  }): Promise<LanHttpResponse>;
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  setServerVault(options: { vaultData: string }): Promise<void>;
  startServer(): Promise<any>;
  stopServer(): Promise<any>;
}

const VaultLanHttp = registerPlugin<VaultLanHttpPlugin>("VaultLanHttp");

export function lanHttpAvailable(): boolean {
  return isCapacitorNative();
}

export function startPcDiscovery(
  onDiscovered: (ip: string, port: number) => void
): Promise<() => void> {
  if (!lanHttpAvailable()) {
    return Promise.resolve(() => {});
  }

  const listenerPromise = (VaultLanHttp as any).addListener(
    "pcDiscovered",
    (data: { ip: string; port: number }) => {
      onDiscovered(data.ip, data.port);
    }
  );

  void VaultLanHttp.startDiscovery();

  return Promise.resolve(() => {
    listenerPromise.then((handle: any) => {
      if (handle && typeof handle.remove === "function") {
        handle.remove();
      }
    });
    void VaultLanHttp.stopDiscovery();
  });
}

export async function lanHttpRequest(options: {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<LanHttpResponse> {
  if (lanHttpAvailable()) {
    return VaultLanHttp.request(options);
  }

  const res = await fetch(options.url, {
    method: options.method,
    headers: options.headers,
    body:
      options.body !== undefined && options.method !== "GET"
        ? options.body
        : undefined,
  });
  const data = await res.text();
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return { status: res.status, headers, data };
}

export function startLanServerNative(): Promise<any> {
  if (!lanHttpAvailable()) return Promise.resolve({ running: false });
  return VaultLanHttp.startServer();
}

export function stopLanServerNative(): Promise<any> {
  if (!lanHttpAvailable()) return Promise.resolve({ running: false });
  return VaultLanHttp.stopServer();
}

export function setServerVaultNative(vaultData: string): Promise<void> {
  if (!lanHttpAvailable()) return Promise.resolve();
  return VaultLanHttp.setServerVault({ vaultData });
}

export function listenForVaultPushNative(
  onPushed: (data: { vaultData: string; etag: string }) => void
): Promise<() => void> {
  if (!lanHttpAvailable()) return Promise.resolve(() => {});
  
  const listenerPromise = (VaultLanHttp as any).addListener(
    "vaultPushed",
    onPushed
  );
  
  return Promise.resolve(() => {
    listenerPromise.then((handle: any) => {
      if (handle && typeof handle.remove === "function") {
        handle.remove();
      }
    });
  });
}

