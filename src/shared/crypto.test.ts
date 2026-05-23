import { describe, it, expect } from 'vitest';
import { generateVaultKey, wrapVaultKey, unwrapVaultKey } from './crypto';

describe('unwrapVaultKey', () => {
  it('should successfully wrap and unwrap a vault key with the correct password', async () => {
    const masterPassword = 'correct_horse_battery_staple';
    const vaultKey = generateVaultKey();

    const { salt, wrappedKey, wrappedKeyIv } = await wrapVaultKey(masterPassword, vaultKey);

    const unwrappedKey = await unwrapVaultKey(masterPassword, salt, wrappedKeyIv, wrappedKey);

    expect(unwrappedKey).toEqual(vaultKey);
  });

  it('should fail to unwrap a vault key with an incorrect master password', async () => {
    const correctPassword = 'correct_horse_battery_staple';
    const incorrectPassword = 'wrong_password';
    const vaultKey = generateVaultKey();

    const { salt, wrappedKey, wrappedKeyIv } = await wrapVaultKey(correctPassword, vaultKey);

    await expect(unwrapVaultKey(incorrectPassword, salt, wrappedKeyIv, wrappedKey))
      .rejects
      .toThrow('Incorrect master password.');
  });
});
