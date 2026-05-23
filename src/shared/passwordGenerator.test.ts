import { describe, it, expect, vi } from 'vitest';
import { generateWebsiteFormatPassword } from './passwordGenerator';

// Note: `randomDigits` uses `crypto.getRandomValues`. We need to mock it if it's not available in the Node/Vitest environment.
// For now, let's just see if Vitest runs it. In some environments `crypto.getRandomValues` isn't globally available,
// or we might want to mock it for deterministic tests. But let's check first.

describe('generateWebsiteFormatPassword', () => {
  it('should generate a password with website and user format', () => {
    const pwd = generateWebsiteFormatPassword('LinkedIn', 'john.doe@example.com');
    // Expected: LINKEDIN_johndoe.XXXXXX
    expect(pwd).toMatch(/^LINKEDIN_johndoe\.\d{6}$/);
  });

  it('should fallback to SITE and user for empty inputs', () => {
    const pwd = generateWebsiteFormatPassword('', '');
    expect(pwd).toMatch(/^SITE_user\.\d{6}$/);
  });

  it('should strip non-alphanumeric characters', () => {
    const pwd = generateWebsiteFormatPassword('My Web-Site!', 'some_user 123');
    expect(pwd).toMatch(/^MYWEBSITE_someuser123\.\d{6}$/);
  });

  it('should extract local part of email and strip non-alphanumeric', () => {
    const pwd = generateWebsiteFormatPassword('Amazon', 'jane.doe+test@gmail.com');
    expect(pwd).toMatch(/^AMAZON_janedoetest\.\d{6}$/);
  });

  it('should append exactly 6 digits at the end', () => {
    const pwd = generateWebsiteFormatPassword('test', 'test');
    const digitsPart = pwd.split('.')[1];
    expect(digitsPart).toHaveLength(6);
    expect(digitsPart).toMatch(/^\d{6}$/);
  });
});
