import { describe, it, expect } from 'vitest';
import { generatePassword } from './passwordGenerator';

describe('generatePassword', () => {
  it('throws an error when all character set options are false', () => {
    expect(() => {
      generatePassword({
        length: 12,
        lowercase: false,
        uppercase: false,
        digits: false,
        symbols: false,
      });
    }).toThrow('Select at least one character set.');
  });
});
