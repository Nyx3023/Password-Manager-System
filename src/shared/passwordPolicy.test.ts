import { describe, it, expect } from 'vitest';
import { validateMasterPassword, masterPasswordPolicyHint } from './passwordPolicy';

describe('passwordPolicy', () => {
  describe('validateMasterPassword', () => {
    it('returns valid for a password that meets all criteria', () => {
      const result = validateMasterPassword('Valid1Password!');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns an error if password is less than 12 characters', () => {
      const result = validateMasterPassword('Val1d!Pass');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least 12 characters');
      expect(result.errors).toHaveLength(1);
    });

    it('returns an error if password has no letters', () => {
      const result = validateMasterPassword('123456789012!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one letter');
      expect(result.errors).toHaveLength(1);
    });

    it('returns an error if password has no numbers', () => {
      const result = validateMasterPassword('ValidPassword!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one number');
      expect(result.errors).toHaveLength(1);
    });

    it('returns an error if password has no special characters', () => {
      const result = validateMasterPassword('Valid1Password');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one special character (!@#$% etc.)');
      expect(result.errors).toHaveLength(1);
    });

    it('returns all errors for an empty password', () => {
      const result = validateMasterPassword('');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least 12 characters');
      expect(result.errors).toContain('At least one letter');
      expect(result.errors).toContain('At least one number');
      expect(result.errors).toContain('At least one special character (!@#$% etc.)');
      expect(result.errors).toHaveLength(4);
    });

    it('returns multiple errors if several criteria are missed', () => {
      const result = validateMasterPassword('short');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least 12 characters');
      expect(result.errors).toContain('At least one number');
      expect(result.errors).toContain('At least one special character (!@#$% etc.)');
      expect(result.errors).not.toContain('At least one letter');
      expect(result.errors).toHaveLength(3);
    });
  });

  describe('masterPasswordPolicyHint', () => {
    it('returns the expected hint string', () => {
      expect(masterPasswordPolicyHint()).toBe('12+ characters, with a letter, a number, and a special character.');
    });
  });
});
