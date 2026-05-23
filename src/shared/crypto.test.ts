import { describe, it, expect } from 'vitest';
import { toBase64, fromBase64 } from './crypto';

describe('Base64 Utilities', () => {
  it('should encode and decode an empty Uint8Array', () => {
    const bytes = new Uint8Array([]);
    const encoded = toBase64(bytes);
    expect(encoded).toBe('');

    const decoded = fromBase64(encoded);
    expect(decoded).toEqual(bytes);
  });

  it('should encode and decode a short Uint8Array', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // 'Hello'
    const encoded = toBase64(bytes);
    expect(encoded).toBe('SGVsbG8=');

    const decoded = fromBase64(encoded);
    expect(decoded).toEqual(bytes);
  });

  it('should correctly round-trip the full byte range (0-255)', () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      bytes[i] = i;
    }

    const encoded = toBase64(bytes);
    expect(typeof encoded).toBe('string');

    const decoded = fromBase64(encoded);
    expect(decoded).toEqual(bytes);
  });

  it('should fail when decoding invalid Base64 string', () => {
    // atob throws an error when an invalid base64 string is provided
    expect(() => fromBase64('Invalid string !@#$')).toThrow();
  });
});
