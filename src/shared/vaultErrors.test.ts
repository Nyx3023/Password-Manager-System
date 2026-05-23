import { describe, it, expect } from 'vitest';
import { VaultDecryptError, isVaultDecryptError } from './vaultErrors';

describe('isVaultDecryptError', () => {
  it('should return true for an instance of VaultDecryptError', () => {
    const error = new VaultDecryptError('payload');
    expect(isVaultDecryptError(error)).toBe(true);
  });

  it('should return false for other Error instances', () => {
    expect(isVaultDecryptError(new Error('Some error'))).toBe(false);
    expect(isVaultDecryptError(new TypeError('Type error'))).toBe(false);
  });

  it('should return false for non-error objects', () => {
    expect(isVaultDecryptError({ code: 'payload' })).toBe(false);
    expect(isVaultDecryptError({ name: 'VaultDecryptError' })).toBe(false);
    expect(isVaultDecryptError(null)).toBe(false);
    expect(isVaultDecryptError(undefined)).toBe(false);
    expect(isVaultDecryptError(123)).toBe(false);
    expect(isVaultDecryptError('string')).toBe(false);
  });
});
