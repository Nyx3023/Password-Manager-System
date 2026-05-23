import { webcrypto } from "node:crypto";

if (!globalThis.crypto) {
  // @ts-ignore
  globalThis.crypto = webcrypto;
}
