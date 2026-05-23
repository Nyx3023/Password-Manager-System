const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{}|;:,.<>?";

export interface GeneratorOptions {
  length: number;
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
}

export function generatePassword(options: GeneratorOptions): string {
  let charset = "";
  const required: string[] = [];

  if (options.lowercase) {
    charset += LOWER;
    required.push(pick(LOWER));
  }
  if (options.uppercase) {
    charset += UPPER;
    required.push(pick(UPPER));
  }
  if (options.digits) {
    charset += DIGITS;
    required.push(pick(DIGITS));
  }
  if (options.symbols) {
    charset += SYMBOLS;
    required.push(pick(SYMBOLS));
  }

  if (!charset) {
    throw new Error("Select at least one character set.");
  }

  const length = Math.max(options.length, required.length);
  const chars: string[] = [...required];
  while (chars.length < length) {
    chars.push(pick(charset));
  }

  shuffle(chars);
  return chars.join("");
}

function getRandomInt(max: number): number {
  if (max <= 1) return 0;
  const maxValid = 4294967296 - (4294967296 % max);
  const arr = new Uint32Array(1);
  while (true) {
    crypto.getRandomValues(arr);
    if (arr[0]! < maxValid) {
      return arr[0]! % max;
    }
  }
}

function pick(charset: string): string {
  const index = getRandomInt(charset.length);
  return charset[index]!;
}

function shuffle<T>(items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = getRandomInt(i + 1);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
}

function randomDigits(count: number): string {
  let out = "";
  for (let i = 0; i < count; i++) {
    out += DIGITS[getRandomInt(DIGITS.length)]!;
  }
  return out;
}

/** Sanitize for WEBSITE_username.123456 template. */
function siteToken(websiteLabel: string): string {
  const letters = websiteLabel.replace(/[^a-zA-Z0-9]/g, "");
  return (letters || "SITE").toUpperCase();
}

function userToken(userLabel: string): string {
  const raw = userLabel.trim();
  const local = raw.includes("@") ? raw.split("@")[0]! : raw;
  const letters = local.replace(/[^a-zA-Z0-9]/g, "");
  return (letters || "user").toLowerCase();
}

/**
 * Template: WEBSITE_username.123456
 * Example: LINKEDIN_john.482910
 */
export function generateWebsiteFormatPassword(
  websiteLabel: string,
  userLabel: string,
): string {
  return `${siteToken(websiteLabel)}_${userToken(userLabel)}.${randomDigits(6)}`;
}
