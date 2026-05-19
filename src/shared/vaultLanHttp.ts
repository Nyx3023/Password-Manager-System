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
}

const VaultLanHttp = registerPlugin<VaultLanHttpPlugin>("VaultLanHttp");

export function lanHttpAvailable(): boolean {
  return isCapacitorNative();
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
