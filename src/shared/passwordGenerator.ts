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

function pick(charset: string): string {
  const index = crypto.getRandomValues(new Uint32Array(1))[0] % charset.length;
  return charset[index]!;
}

function shuffle<T>(items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
}
