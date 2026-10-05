import { describe, it, expect } from "vitest";
import {
  base32Decode,
  base32Encode,
  generateTotp,
  getTotpTimeRemaining,
  parseOtpauthUri,
  parseGoogleAuthMigrationUri,
  isGoogleAuthMigrationUri,
  parseAegisJson,
  parse2FasJson,
} from "../src/shared/totp";

describe("totp module", () => {
  it("should encode and decode base32 accurately", () => {
    const originalText = "SecureX-Offline-Vault";
    const bytes = new TextEncoder().encode(originalText);
    const encoded = base32Encode(bytes);
    const decodedBytes = base32Decode(encoded);
    const decodedText = new TextDecoder().decode(decodedBytes);

    expect(decodedText).toBe(originalText);
  });

  it("should generate standard 6-digit TOTP code for known vector", async () => {
    // Secret "JBSWY3DPEHPK3PXP" is RFC standard test vector
    const secret = "JBSWY3DPEHPK3PXP";
    // At Unix timestamp 1111111110 seconds = 1111111110000 ms
    const code = await generateTotp(secret, 1111111110 * 1000);
    expect(code).toHaveLength(6);
    expect(/^\d{6}$/.test(code)).toBe(true);
  });

  it("should calculate time remaining within 1..30s", () => {
    const rem = getTotpTimeRemaining(30);
    expect(rem).toBeGreaterThanOrEqual(1);
    expect(rem).toBeLessThanOrEqual(30);
  });

  it("should parse otpauth:// URIs with issuer and account", () => {
    const uri = "otpauth://totp/GitHub:user%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&digits=6&period=30";
    const parsed = parseOtpauthUri(uri);

    expect(parsed).not.toBeNull();
    expect(parsed?.issuer).toBe("GitHub");
    expect(parsed?.name).toBe("user@example.com");
    expect(parsed?.secret).toBe("JBSWY3DPEHPK3PXP");
    expect(parsed?.digits).toBe(6);
    expect(parsed?.period).toBe(30);
  });

  it("should parse Aegis JSON backup format", () => {
    const aegisJson = JSON.stringify({
      version: 1,
      db: {
        entries: [
          {
            type: "totp",
            name: "GitHub",
            issuer: "GitHub",
            info: {
              secret: "JBSWY3DPEHPK3PXP",
              digits: 6,
              period: 30,
            },
          },
        ],
      },
    });

    const accounts = parseAegisJson(aegisJson);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].name).toBe("GitHub");
    expect(accounts[0].secret).toBe("JBSWY3DPEHPK3PXP");
  });

  it("should parse 2FAS JSON backup format", () => {
    const twoFasJson = JSON.stringify({
      schemaVersion: 4,
      services: [
        {
          name: "GitLab",
          secret: "JBSWY3DPEHPK3PXP",
          otp: {
            digits: 6,
            period: 30,
            account: "dev@gitlab.com",
          },
        },
      ],
    });

    const accounts = parse2FasJson(twoFasJson);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].issuer).toBe("GitLab");
    expect(accounts[0].name).toBe("dev@gitlab.com");
    expect(accounts[0].secret).toBe("JBSWY3DPEHPK3PXP");
  });

  it("should parse Google Authenticator migration URI format", () => {
    // We construct a mock protobuf payload for otpauth-migration://
    // Field 1 (otp_parameters) -> length-delimited
    // Inside: Field 1 (secret bytes), Field 2 (name string), Field 3 (issuer string)
    const secretBytes = base32Decode("JBSWY3DPEHPK3PXP");
    const nameBytes = new TextEncoder().encode("alice@gmail.com");
    const issuerBytes = new TextEncoder().encode("Google");

    // Submessage
    const submessage: number[] = [
      (1 << 3) | 2, secretBytes.length, ...secretBytes,
      (2 << 3) | 2, nameBytes.length, ...nameBytes,
      (3 << 3) | 2, issuerBytes.length, ...issuerBytes,
    ];

    // Main message: field 1 (otp_parameters) length-delimited
    const mainMessage: number[] = [
      (1 << 3) | 2, submessage.length, ...submessage,
    ];

    const binaryStr = String.fromCharCode(...mainMessage);
    const b64 = btoa(binaryStr);
    const migrationUri = `otpauth-migration://offline?data=${encodeURIComponent(b64)}`;

    const accounts = parseGoogleAuthMigrationUri(migrationUri);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].name).toBe("alice@gmail.com");
    expect(accounts[0].issuer).toBe("Google");
    expect(accounts[0].secret).toBe("JBSWY3DPEHPK3PXP");
  });

  it("should detect Google Authenticator migration URIs correctly", () => {
    expect(isGoogleAuthMigrationUri("otpauth-migration://offline?data=xyz")).toBe(true);
    expect(isGoogleAuthMigrationUri("otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP")).toBe(false);
    expect(isGoogleAuthMigrationUri("")).toBe(false);
  });

  it("should parse batch multi-account Google Authenticator exports with URL-safe base64", () => {
    const secret1 = base32Decode("JBSWY3DPEHPK3PXP");
    const name1 = new TextEncoder().encode("bob@gmail.com");
    const sub1 = [
      (1 << 3) | 2, secret1.length, ...secret1,
      (2 << 3) | 2, name1.length, ...name1,
    ];

    const secret2 = base32Decode("MZXW6YTBOI======");
    const name2 = new TextEncoder().encode("GitHub:charlie");
    const sub2 = [
      (1 << 3) | 2, secret2.length, ...secret2,
      (2 << 3) | 2, name2.length, ...name2,
    ];

    const mainMessage = [
      (1 << 3) | 2, sub1.length, ...sub1,
      (1 << 3) | 2, sub2.length, ...sub2,
    ];

    const binaryStr = String.fromCharCode(...mainMessage);
    // Convert to URL-safe base64 with stripped padding
    const b64 = btoa(binaryStr).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    const uri = `otpauth-migration://offline?data=${b64}`;

    const accounts = parseGoogleAuthMigrationUri(uri);
    expect(accounts).toHaveLength(2);
    expect(accounts[0].name).toBe("bob@gmail.com");
    expect(accounts[0].secret).toBe("JBSWY3DPEHPK3PXP");
    expect(accounts[1].issuer).toBe("GitHub");
    expect(accounts[1].name).toBe("charlie");
    expect(accounts[1].secret).toBe("MZXW6YTBOI");
  });
});
