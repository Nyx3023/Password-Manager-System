/**
 * Google Drive OAuth 2.0 PKCE & Drive v3 API Wrapper for SecureX
 * Zero-Knowledge: Files are encrypted with Master Password before upload.
 * Restricted Scope: https://www.googleapis.com/auth/drive.appdata
 */

import { Capacitor, CapacitorHttp } from "@capacitor/core";

export const DRIVE_APPDATA_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
export const USERINFO_EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email";
export const USERINFO_PROFILE_SCOPE = "https://www.googleapis.com/auth/userinfo.profile";

export const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
export const GOOGLE_DRIVE_FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";
export const GOOGLE_DRIVE_UPLOAD_ENDPOINT = "https://www.googleapis.com/upload/drive/v3/files";

export const VAULT_FILE_NAME = "securex_vault.enc.json";

export interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
  scope?: string;
}

export interface GoogleUserProfile {
  sub: string;
  name: string;
  email: string;
  picture?: string;
}

export interface DriveVaultFile {
  id: string;
  name: string;
  modifiedTime: string;
  md5Checksum?: string;
  size?: string;
}

export interface SafeFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<any>;
  text: () => Promise<string>;
}

/**
 * Universal fetch that routes through Electron IPC netFetch on desktop
 * to bypass Chromium file:// CORS limitations, or uses browser fetch.
 */
export async function safeFetch(
  url: string,
  options?: {
    method?: string;
    headers?: Record<string, string> | Headers | [string, string][];
    body?: string;
  }
): Promise<SafeFetchResponse> {
  if (typeof window !== "undefined" && window.electronAPI?.netFetch) {
    const headersObj: Record<string, string> = {};
    if (options?.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((val, key) => {
          headersObj[key] = val;
        });
      } else if (Array.isArray(options.headers)) {
        for (const [k, v] of options.headers) headersObj[k] = v;
      } else {
        Object.assign(headersObj, options.headers);
      }
    }

    const res = await window.electronAPI.netFetch(url, {
      method: options?.method || "GET",
      headers: headersObj,
      body: options?.body,
    });

    if (res.status === 0 && res.error) {
      throw new Error(res.error);
    }

    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      json: async () => res.data ?? (res.text ? JSON.parse(res.text) : {}),
      text: async () => res.text ?? (typeof res.data === "string" ? res.data : JSON.stringify(res.data || "")),
    };
  }

  if (Capacitor.isNativePlatform()) {
    const headersObj: Record<string, string> = {};
    if (options?.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((val, key) => {
          headersObj[key] = val;
        });
      } else if (Array.isArray(options.headers)) {
        for (const [k, v] of options.headers) headersObj[k] = v;
      } else {
        Object.assign(headersObj, options.headers);
      }
    }

    const res = await CapacitorHttp.request({
      url,
      method: options?.method || "GET",
      headers: headersObj,
      data: options?.body,
      responseType: "text",
    });

    const isOk = res.status >= 200 && res.status < 300;
    return {
      ok: isOk,
      status: res.status,
      statusText: String(res.status),
      json: async () => (typeof res.data === "string" ? JSON.parse(res.data) : res.data),
      text: async () => (typeof res.data === "string" ? res.data : JSON.stringify(res.data || "")),
    };
  }

  const res = await fetch(url, options as RequestInit);
  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    json: () => res.json(),
    text: () => res.text(),
  };
}

/**
 * Convert an ArrayBuffer or Uint8Array to a URL-safe Base64 string without padding.
 */
export function bufferToBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Generate a cryptographically random code verifier for PKCE (43-128 chars).
 */
export function generateCodeVerifier(length = 64): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return bufferToBase64Url(array);
}

/**
 * Compute the SHA-256 code challenge for a given code verifier.
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bufferToBase64Url(digest);
}

/**
 * Construct the OAuth 2.0 authorization URL with PKCE parameters.
 */
export function buildGoogleAuthUrl(options: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
}): string {
  const scopes = [
    DRIVE_APPDATA_SCOPE,
    USERINFO_EMAIL_SCOPE,
    USERINFO_PROFILE_SCOPE,
  ].join(" ");

  const params = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: "code",
    scope: scopes,
    code_challenge: options.codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
  });

  if (options.state) {
    params.set("state", options.state);
  }

  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Exchange the authorization code + verifier for tokens.
 */
export async function exchangeGoogleAuthCode(options: {
  clientId: string;
  clientSecret?: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<GoogleTokens> {
  const body = new URLSearchParams({
    client_id: options.clientId,
    grant_type: "authorization_code",
    code: options.code,
    code_verifier: options.codeVerifier,
    redirect_uri: options.redirectUri,
  });

  if (options.clientSecret) {
    body.set("client_secret", options.clientSecret);
  }

  const res = await safeFetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(
      data.error_description || data.error || `Token exchange failed (HTTP ${res.status})`
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    tokenType: data.token_type,
    scope: data.scope,
  };
}

/**
 * Refresh an expired access token using the refresh token.
 */
export async function refreshGoogleAccessToken(options: {
  clientId: string;
  clientSecret?: string;
  refreshToken: string;
}): Promise<GoogleTokens> {
  const body = new URLSearchParams({
    client_id: options.clientId,
    grant_type: "refresh_token",
    refresh_token: options.refreshToken,
  });

  if (options.clientSecret) {
    body.set("client_secret", options.clientSecret);
  }

  const res = await safeFetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(
      data.error_description || data.error || `Token refresh failed (HTTP ${res.status})`
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || options.refreshToken,
    expiresIn: data.expires_in,
    tokenType: data.token_type,
    scope: data.scope,
  };
}

/**
 * Fetch the authenticated Google user's profile info (email, name, picture).
 */
export async function fetchGoogleUserProfile(accessToken: string): Promise<GoogleUserProfile> {
  const res = await safeFetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch user profile (HTTP ${res.status})`);
  }

  return res.json();
}

/**
 * Search Google Drive Application Data folder for existing vault file.
 */
export async function findDriveVaultFile(
  accessToken: string,
  fileName = VAULT_FILE_NAME
): Promise<DriveVaultFile | null> {
  const query = `name='${fileName}' and trashed=false`;
  const url = `${GOOGLE_DRIVE_FILES_ENDPOINT}?spaces=appDataFolder&q=${encodeURIComponent(
    query
  )}&fields=files(id,name,modifiedTime,md5Checksum,size)`;

  const res = await safeFetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to query Drive files (HTTP ${res.status}): ${errorText}`);
  }

  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0] as DriveVaultFile;
  }
  return null;
}

/**
 * Download raw encrypted vault JSON from Google Drive.
 */
export async function downloadDriveVaultFile(
  accessToken: string,
  fileId: string
): Promise<string> {
  const url = `${GOOGLE_DRIVE_FILES_ENDPOINT}/${fileId}?alt=media`;
  const res = await safeFetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to download vault file (HTTP ${res.status}): ${errorText}`);
  }

  return res.text();
}

/**
 * Upload encrypted vault JSON to Google Drive (Zero-Knowledge).
 * Updates existing file if fileId is provided, or creates new file in appDataFolder.
 */
export async function uploadDriveVaultFile(
  accessToken: string,
  encryptedJson: string,
  existingFileId?: string,
  fileName = VAULT_FILE_NAME
): Promise<DriveVaultFile> {
  if (existingFileId) {
    // Overwrite existing file content via media patch
    const patchUrl = `${GOOGLE_DRIVE_UPLOAD_ENDPOINT}/${existingFileId}?uploadType=media`;
    const res = await safeFetch(patchUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: encryptedJson,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to update vault file (HTTP ${res.status}): ${errorText}`);
    }

    return res.json();
  }

  // Create new file with multipart upload
  const boundary = `-------SecureXBoundary${Math.random().toString(36).substring(2)}`;
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = JSON.stringify({
    name: fileName,
    parents: ["appDataFolder"],
  });

  const multipartBody =
    `--${boundary}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    metadata +
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    encryptedJson +
    closeDelimiter;

  const createUrl = `${GOOGLE_DRIVE_UPLOAD_ENDPOINT}?uploadType=multipart&fields=id,name,modifiedTime,md5Checksum,size`;
  const res = await safeFetch(createUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to upload vault file (HTTP ${res.status}): ${errorText}`);
  }

  return res.json();
}

/**
 * Delete vault file from Google Drive (e.g. on cloud purge).
 */
export async function deleteDriveVaultFile(
  accessToken: string,
  fileId: string
): Promise<void> {
  const url = `${GOOGLE_DRIVE_FILES_ENDPOINT}/${fileId}`;
  const res = await safeFetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok && res.status !== 404) {
    const errorText = await res.text();
    throw new Error(`Failed to delete vault file (HTTP ${res.status}): ${errorText}`);
  }
}
