import { describe, it, expect } from "vitest";

// Use node require to import vaultPaths CJS module
// eslint-disable-next-line @typescript-eslint/no-require-imports
const vaultPaths = require("../desktop/vaultPaths.cjs");

describe("vaultPaths sanitizeFileName security checks", () => {
  it("allows legitimate primary vault and state files", () => {
    const validFiles = [
      "vault.enc.json",
      "vault.enc.json.bak",
      "vault.enc.json.bak.1",
      "vault.enc.json.bak.2",
      "vault.enc.json.bak.3",
      "vault.enc.json.tmp",
      "app.prefs.json",
      "ipc-session.token",
      "mpin-device.json",
      "unlock-attempts.json",
      "firebase_sync_state.json",
      "firebase_project_config.json",
      "cached_accounts.json",
    ];

    for (const file of validFiles) {
      expect(vaultPaths.sanitizeFileName(file)).toBe(file);
    }
  });

  it("allows per-account vault, mpin, and auth_session files", () => {
    const validAccountFiles = [
      "vault_user123.enc.json",
      "vault_google-oauth2_456.enc.json",
      "mpin_user123.json",
      "auth_session_user123.json",
      "auth_session_firebase-uid-789.json",
    ];

    for (const file of validAccountFiles) {
      expect(vaultPaths.sanitizeFileName(file)).toBe(file);
    }
  });

  it("blocks directory traversal attempts", () => {
    const attackPaths = [
      "../vault.enc.json",
      "..\\vault.enc.json",
      "../../etc/passwd",
      "..\\..\\Windows\\System32\\calc.exe",
      "folder/vault.enc.json",
      "folder\\vault.enc.json",
      "vault.enc.json\0evil",
    ];

    for (const path of attackPaths) {
      expect(() => vaultPaths.sanitizeFileName(path)).toThrow(/traversal|Invalid/);
    }
  });

  it("blocks hidden files and unallowlisted filenames", () => {
    const unallowedFiles = [
      ".env",
      ".git",
      ".htaccess",
      "payload.exe",
      "script.js",
      "arbitrary.json",
      "vault_malicious.sh",
      "cmd.bat",
    ];

    for (const file of unallowedFiles) {
      expect(() => vaultPaths.sanitizeFileName(file)).toThrow(/not allowed|hidden|Invalid/);
    }
  });

  it("rejects non-string or empty inputs", () => {
    expect(() => vaultPaths.sanitizeFileName("")).toThrow();
    // @ts-expect-error test invalid types
    expect(() => vaultPaths.sanitizeFileName(null)).toThrow();
    // @ts-expect-error test invalid types
    expect(() => vaultPaths.sanitizeFileName(undefined)).toThrow();
  });
});
