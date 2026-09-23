/**
 * RFC 6238 TOTP (Time-Based One-Time Password) implementation & Authenticator Importers.
 * Pure TypeScript using Web Crypto API.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export interface TotpAccount {
  name: string;
  issuer?: string;
  secret: string;
  algorithm?: string;
  digits?: number;
  period?: number;
}

/**
 * Decode a Base32 string into bytes.
 */
export function base32Decode(str: string): Uint8Array {
  const clean = str.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return new Uint8Array(output);
}

/**
 * Encode bytes into Base32 string.
 */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Generate a 6-digit TOTP code for a Base32 secret at a given timestamp.
 */
export async function generateTotp(
  secret: string,
  timeMs: number = Date.now(),
  period: number = 30,
  digits: number = 6,
): Promise<string> {
  const keyBytes = base32Decode(secret);
  if (keyBytes.length === 0) {
    throw new Error("Invalid or empty Base32 secret.");
  }

  const counter = Math.floor(timeMs / 1000 / period);
  const counterBuffer = new ArrayBuffer(8);
  const counterView = new DataView(counterBuffer);
  // Big-endian 64-bit integer
  counterView.setUint32(0, Math.floor(counter / 0x100000000));
  counterView.setUint32(4, counter >>> 0);

  const keyBuffer = new Uint8Array(keyBytes.byteLength);
  keyBuffer.set(keyBytes);

  const key = await crypto.subtle.importKey(
    "raw",
    keyBuffer.buffer,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, counterBuffer);
  const hash = new Uint8Array(signature);

  // Dynamic truncation (RFC 4226)
  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  const otp = binary % Math.pow(10, digits);
  return otp.toString().padStart(digits, "0");
}

/**
 * Return seconds remaining in the current 30-second TOTP window.
 */
export function getTotpTimeRemaining(period: number = 30): number {
  const seconds = Math.floor(Date.now() / 1000);
  return period - (seconds % period);
}

/**
 * Parse an otpauth:// URI into a TotpAccount object.
 */
export function parseOtpauthUri(uri: string): TotpAccount | null {
  try {
    const parsed = new URL(uri.trim());
    if (parsed.protocol !== "otpauth:" || parsed.host !== "totp") {
      return null;
    }

    const label = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    const secret = parsed.searchParams.get("secret");
    if (!secret) return null;

    let issuer = parsed.searchParams.get("issuer") || undefined;
    let name = label;

    if (label.includes(":")) {
      const parts = label.split(":");
      if (!issuer) issuer = parts[0].trim();
      name = parts.slice(1).join(":").trim();
    }

    const digits = parseInt(parsed.searchParams.get("digits") || "6", 10);
    const period = parseInt(parsed.searchParams.get("period") || "30", 10);

    return {
      name,
      issuer,
      secret: secret.toUpperCase().replace(/\s/g, ""),
      digits: isNaN(digits) ? 6 : digits,
      period: isNaN(period) ? 30 : period,
    };
  } catch {
    return null;
  }
}

/**
 * Minimalist pure Protobuf reader for Google Authenticator migration URIs.
 */
class SimpleProtobufReader {
  private buffer: Uint8Array;
  private pos = 0;

  constructor(buffer: Uint8Array) {
    this.buffer = buffer;
  }

  hasMore(): boolean {
    return this.pos < this.buffer.length;
  }

  readVarint(): number {
    let result = 0;
    let shift = 0;
    while (this.pos < this.buffer.length) {
      const b = this.buffer[this.pos++];
      result |= (b & 0x7f) << shift;
      if (!(b & 0x80)) break;
      shift += 7;
    }
    return result;
  }

  readTag(): { field: number; wireType: number } | null {
    if (!this.hasMore()) return null;
    const v = this.readVarint();
    return { field: v >>> 3, wireType: v & 0x07 };
  }

  readBytes(): Uint8Array {
    const len = this.readVarint();
    const bytes = this.buffer.slice(this.pos, this.pos + len);
    this.pos += len;
    return bytes;
  }

  readString(): string {
    const bytes = this.readBytes();
    return new TextDecoder().decode(bytes);
  }

  skip(wireType: number): void {
    if (wireType === 0) {
      this.readVarint();
    } else if (wireType === 2) {
      const len = this.readVarint();
      this.pos += len;
    } else if (wireType === 1) {
      this.pos += 8;
    } else if (wireType === 5) {
      this.pos += 4;
    }
  }
}

/**
 * Parse a Google Authenticator export migration URI:
 * otpauth-migration://offline?data=...
 */
export function parseGoogleAuthMigrationUri(uri: string): TotpAccount[] {
  try {
    const parsed = new URL(uri.trim());
    if (parsed.protocol !== "otpauth-migration:") return [];
    const rawData = parsed.searchParams.get("data");
    if (!rawData) return [];

    const binary = atob(rawData);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const reader = new SimpleProtobufReader(bytes);
    const accounts: TotpAccount[] = [];

    while (reader.hasMore()) {
      const tag = reader.readTag();
      if (!tag) break;

      if (tag.field === 1 && tag.wireType === 2) {
        // OtpParameters message
        const paramBytes = reader.readBytes();
        const paramReader = new SimpleProtobufReader(paramBytes);

        let secretBytes: Uint8Array | null = null;
        let name = "";
        let issuer = "";
        let digits = 6;

        while (paramReader.hasMore()) {
          const pTag = paramReader.readTag();
          if (!pTag) break;

          if (pTag.field === 1 && pTag.wireType === 2) {
            secretBytes = paramReader.readBytes();
          } else if (pTag.field === 2 && pTag.wireType === 2) {
            name = paramReader.readString();
          } else if (pTag.field === 3 && pTag.wireType === 2) {
            issuer = paramReader.readString();
          } else if (pTag.field === 5 && pTag.wireType === 0) {
            const d = paramReader.readVarint();
            digits = d === 2 ? 8 : 6;
          } else {
            paramReader.skip(pTag.wireType);
          }
        }

        if (secretBytes && secretBytes.length > 0) {
          const secret = base32Encode(secretBytes);
          accounts.push({
            name: name || issuer || "Account",
            issuer: issuer || undefined,
            secret,
            digits,
            period: 30,
          });
        }
      } else {
        reader.skip(tag.wireType);
      }
    }

    return accounts;
  } catch (e) {
    console.error("Error parsing Google Authenticator migration payload:", e);
    return [];
  }
}

/**
 * Parse an Aegis Authenticator JSON export.
 */
export function parseAegisJson(jsonStr: string): TotpAccount[] {
  try {
    const data = JSON.parse(jsonStr);
    const entries = data?.db?.entries || [];
    const accounts: TotpAccount[] = [];

    for (const e of entries) {
      if (e.type?.toLowerCase() === "totp" && e.info?.secret) {
        accounts.push({
          name: e.name || e.issuer || "Account",
          issuer: e.issuer || undefined,
          secret: String(e.info.secret).replace(/\s/g, "").toUpperCase(),
          digits: e.info.digits || 6,
          period: e.info.period || 30,
        });
      }
    }
    return accounts;
  } catch {
    return [];
  }
}

/**
 * Parse a 2FAS Authenticator JSON export.
 */
export function parse2FasJson(jsonStr: string): TotpAccount[] {
  try {
    const data = JSON.parse(jsonStr);
    const services = data?.services || [];
    const accounts: TotpAccount[] = [];

    for (const s of services) {
      const secret = s.secret || s.token?.secret;
      if (secret) {
        accounts.push({
          name: s.otp?.account || s.name || "Account",
          issuer: s.name || s.otp?.issuer || undefined,
          secret: String(secret).replace(/\s/g, "").toUpperCase(),
          digits: s.otp?.digits || 6,
          period: s.otp?.period || 30,
        });
      }
    }
    return accounts;
  } catch {
    return [];
  }
}
