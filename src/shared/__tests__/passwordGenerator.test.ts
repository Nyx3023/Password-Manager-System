import { describe, it, expect, vi } from "vitest";
import {
  generatePassword,
  generateWebsiteFormatPassword,
  GeneratorOptions,
} from "../passwordGenerator";

describe("generatePassword", () => {
  it("should throw an error if no character sets are selected", () => {
    const options: GeneratorOptions = {
      length: 12,
      lowercase: false,
      uppercase: false,
      digits: false,
      symbols: false,
    };
    expect(() => generatePassword(options)).toThrow(
      "Select at least one character set."
    );
  });

  it("should return a password of the requested length", () => {
    const options: GeneratorOptions = {
      length: 15,
      lowercase: true,
      uppercase: true,
      digits: true,
      symbols: true,
    };
    const password = generatePassword(options);
    expect(password.length).toBe(15);
  });

  it("should include characters from the required character sets", () => {
    const options: GeneratorOptions = {
      length: 20,
      lowercase: true,
      uppercase: true,
      digits: true,
      symbols: true,
    };
    const password = generatePassword(options);
    expect(/[a-z]/.test(password)).toBe(true);
    expect(/[A-Z]/.test(password)).toBe(true);
    expect(/[0-9]/.test(password)).toBe(true);
    expect(/[!@#$%^&*()-_=+[\]{}|;:,.<>?]/.test(password)).toBe(true);
  });

  it("should respect individual character set flags", () => {
    const options: GeneratorOptions = {
      length: 10,
      lowercase: true,
      uppercase: false,
      digits: false,
      symbols: false,
    };
    const password = generatePassword(options);
    expect(/^[a-z]+$/.test(password)).toBe(true);
    expect(password.length).toBe(10);
  });

  it("should return length matching required length if requested length is shorter", () => {
    // If we only request length 2 but require 4 character sets
    const options: GeneratorOptions = {
      length: 2,
      lowercase: true,
      uppercase: true,
      digits: true,
      symbols: true,
    };
    const password = generatePassword(options);
    // Math.max(options.length, required.length) => 4
    expect(password.length).toBe(4);
    expect(/[a-z]/.test(password)).toBe(true);
    expect(/[A-Z]/.test(password)).toBe(true);
    expect(/[0-9]/.test(password)).toBe(true);
    expect(/[!@#$%^&*()-_=+[\]{}|;:,.<>?]/.test(password)).toBe(true);
  });
});

describe("generateWebsiteFormatPassword", () => {
  it("should format website label and user label properly with 6 random digits", () => {
    const password = generateWebsiteFormatPassword("LINKEDIN", "john");
    // e.g. LINKEDIN_john.482910
    expect(password).toMatch(/^LINKEDIN_john\.\d{6}$/);
  });

  it("should sanitize non-alphanumeric characters from labels", () => {
    const password = generateWebsiteFormatPassword("My-Site!", "user@example.com");
    // site: MySite -> MYSITE
    // user: user@example.com -> user
    expect(password).toMatch(/^MYSITE_user\.\d{6}$/);
  });

  it("should handle empty or full non-alphanumeric strings with fallback", () => {
    const password = generateWebsiteFormatPassword("---", "@@@");
    // site fallback: SITE
    // user fallback: user
    expect(password).toMatch(/^SITE_user\.\d{6}$/);
  });
});
