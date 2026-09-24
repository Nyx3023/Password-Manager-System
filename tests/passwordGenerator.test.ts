import { describe, it, expect } from "vitest";
import {
  generatePassword,
  generateWebsiteFormatPassword,
  generatePassphrase,
  DICEWARE_WORDLIST,
} from "../src/shared/passwordGenerator";

describe("passwordGenerator", () => {
  describe("generatePassword", () => {
    it("generates password with requested length", () => {
      const pwd = generatePassword({
        length: 24,
        lowercase: true,
        uppercase: true,
        digits: true,
        symbols: true,
      });
      expect(pwd).toHaveLength(24);
    });

    it("throws error if no character sets are selected", () => {
      expect(() =>
        generatePassword({
          length: 16,
          lowercase: false,
          uppercase: false,
          digits: false,
          symbols: false,
        }),
      ).toThrow("Select at least one character set.");
    });

    it("respects selected character sets", () => {
      const digitsOnly = generatePassword({
        length: 12,
        lowercase: false,
        uppercase: false,
        digits: true,
        symbols: false,
      });
      expect(digitsOnly).toMatch(/^[0-9]+$/);
    });
  });

  describe("generateWebsiteFormatPassword", () => {
    it("formats with uppercase site and lowercase username followed by 6 digits", () => {
      const pwd = generateWebsiteFormatPassword("GitHub", "john.doe@example.com");
      expect(pwd).toMatch(/^GITHUB_johndoe\.[0-9]{6}$/);
    });

    it("falls back gracefully when inputs are empty or special chars", () => {
      const pwd = generateWebsiteFormatPassword("!@#$", "???");
      expect(pwd).toMatch(/^SITE_user\.[0-9]{6}$/);
    });
  });

  describe("generatePassphrase", () => {
    it("generates 4 words by default with hyphen separator and number suffix", () => {
      const phrase = generatePassphrase();
      const parts = phrase.split("-");
      // 4 words + 1 number
      expect(parts.length).toBe(5);
      const words = parts.slice(0, 4);
      const numberPart = parts[4];
      expect(numberPart).toMatch(/^[0-9]+$/);
      for (const w of words) {
        expect(DICEWARE_WORDLIST).toContain(w.toLowerCase());
      }
    });

    it("respects custom word count", () => {
      const phrase = generatePassphrase({ wordCount: 6, includeNumber: false });
      const parts = phrase.split("-");
      expect(parts.length).toBe(6);
    });

    it("respects custom separator", () => {
      const phrase = generatePassphrase({ separator: ".", includeNumber: false });
      const parts = phrase.split(".");
      expect(parts.length).toBe(4);
    });

    it("capitalizes words when capitalize is true", () => {
      const phrase = generatePassphrase({ capitalize: true, includeNumber: false });
      const parts = phrase.split("-");
      for (const w of parts) {
        expect(w[0]).toBe(w[0]!.toUpperCase());
      }
    });

    it("omits number when includeNumber is false", () => {
      const phrase = generatePassphrase({ includeNumber: false });
      const parts = phrase.split("-");
      expect(parts.length).toBe(4);
      for (const w of parts) {
        expect(Number.isNaN(Number(w))).toBe(true);
      }
    });
  });
});
