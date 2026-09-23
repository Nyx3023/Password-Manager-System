import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  bufferToBase64Url,
  generateCodeVerifier,
  generateCodeChallenge,
  buildGoogleAuthUrl,
  findDriveVaultFile,
  downloadDriveVaultFile,
  uploadDriveVaultFile,
  deleteDriveVaultFile,
  DRIVE_APPDATA_SCOPE,
} from "../src/shared/googleDrive";
import {
  syncVaultWithGoogleDrive,
  saveCloudConfig,
  type VaultSyncTarget,
  defaultCloudConfig,
} from "../src/shared/cloudSync";

describe("Google Drive PKCE & OAuth Helpers", () => {
  it("bufferToBase64Url should produce valid base64url without padding", () => {
    const data = new Uint8Array([0, 1, 2, 250, 255]);
    const b64url = bufferToBase64Url(data);
    expect(b64url).not.toContain("=");
    expect(b64url).not.toContain("+");
    expect(b64url).not.toContain("/");
  });

  it("generateCodeVerifier should produce valid random string", () => {
    const verifier1 = generateCodeVerifier(32);
    const verifier2 = generateCodeVerifier(32);
    expect(verifier1).toBeTruthy();
    expect(verifier2).toBeTruthy();
    expect(verifier1).not.toBe(verifier2);
    expect(verifier1).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generateCodeChallenge should compute correct RFC 7636 test vector", async () => {
    // RFC 7636 Appendix B test vector
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = await generateCodeChallenge(verifier);
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("buildGoogleAuthUrl should include all required OAuth parameters", () => {
    const urlStr = buildGoogleAuthUrl({
      clientId: "test-client.apps.googleusercontent.com",
      redirectUri: "http://127.0.0.1:8080/oauth2callback",
      codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    });

    const url = new URL(urlStr);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.pathname).toBe("/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("test-client.apps.googleusercontent.com");
    expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:8080/oauth2callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("scope")).toContain(DRIVE_APPDATA_SCOPE);
  });
});

describe("Google Drive v3 REST API Wrappers", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("findDriveVaultFile should query appDataFolder and return first file", async () => {
    const mockResponse = {
      files: [
        {
          id: "drive-file-123",
          name: "securex_vault.enc.json",
          modifiedTime: "2026-09-22T10:00:00.000Z",
          md5Checksum: "abcdef123456",
          size: "4096",
        },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    }) as any;

    const file = await findDriveVaultFile("mock-access-token");
    expect(file).toEqual(mockResponse.files[0]);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("spaces=appDataFolder"),
      expect.objectContaining({
        headers: { Authorization: "Bearer mock-access-token" },
      })
    );
  });

  it("downloadDriveVaultFile should fetch raw content with alt=media", async () => {
    const mockContent = '{"kdf":"argon2id","ciphertext":"test-encrypted"}';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockContent,
    }) as any;

    const content = await downloadDriveVaultFile("mock-token", "file-999");
    expect(content).toBe(mockContent);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://www.googleapis.com/drive/v3/files/file-999?alt=media",
      expect.objectContaining({
        headers: { Authorization: "Bearer mock-token" },
      })
    );
  });

  it("uploadDriveVaultFile should perform multipart upload for new file", async () => {
    const mockCreated = {
      id: "new-drive-id",
      name: "securex_vault.enc.json",
      modifiedTime: "2026-09-22T12:00:00.000Z",
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockCreated,
    }) as any;

    const res = await uploadDriveVaultFile("mock-token", '{"vault":"data"}');
    expect(res.id).toBe("new-drive-id");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("uploadType=multipart"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer mock-token",
        }),
      })
    );
  });

  it("uploadDriveVaultFile should perform PATCH for existing fileId", async () => {
    const mockUpdated = {
      id: "existing-id",
      name: "securex_vault.enc.json",
      modifiedTime: "2026-09-22T14:00:00.000Z",
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockUpdated,
    }) as any;

    const res = await uploadDriveVaultFile("mock-token", '{"vault":"updated"}', "existing-id");
    expect(res.id).toBe("existing-id");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://www.googleapis.com/upload/drive/v3/files/existing-id?uploadType=media",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({
          Authorization: "Bearer mock-token",
          "Content-Type": "application/json; charset=UTF-8",
        }),
      })
    );
  });

  it("deleteDriveVaultFile should call DELETE endpoint", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
    }) as any;

    await deleteDriveVaultFile("mock-token", "file-to-delete");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://www.googleapis.com/drive/v3/files/file-to-delete",
      expect.objectContaining({
        method: "DELETE",
        headers: { Authorization: "Bearer mock-token" },
      })
    );
  });
});

describe("CloudSync High-Level Synchronization Routine", () => {
  it("syncVaultWithGoogleDrive should abort if vault is locked", async () => {
    const mockVault: VaultSyncTarget = {
      unlocked: false,
      exportVault: vi.fn(),
      mergeUnlockedFromRaw: vi.fn(),
    };

    const result = await syncVaultWithGoogleDrive(mockVault);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("VAULT_LOCKED");
  });

  it("syncVaultWithGoogleDrive should abort if sync is disabled", async () => {
    await saveCloudConfig({ ...defaultCloudConfig, enabled: false });

    const mockVault: VaultSyncTarget = {
      unlocked: true,
      exportVault: vi.fn().mockResolvedValue('{"local":"vault"}'),
      mergeUnlockedFromRaw: vi.fn(),
    };

    const result = await syncVaultWithGoogleDrive(mockVault);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("SYNC_DISABLED");
  });
});
