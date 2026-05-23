import { describe, it, expect } from "vitest";
import { validateLanEndpoint, parseLanEndpoint } from "./lanSync";

describe("validateLanEndpoint", () => {
  it("should return null for valid IP and port", () => {
    expect(validateLanEndpoint("192.168.1.42", 9847)).toBeNull();
    expect(validateLanEndpoint("10.0.0.1", 1)).toBeNull();
    expect(validateLanEndpoint("172.16.254.1", 65535)).toBeNull();
  });

  it("should return error for empty or whitespace host", () => {
    const emptyMsg = "Enter the PC IP address (example: 192.168.1.42).";
    expect(validateLanEndpoint("", 9847)).toBe(emptyMsg);
    expect(validateLanEndpoint("   ", 9847)).toBe(emptyMsg);
  });

  it("should return error for invalid IPv4 format", () => {
    const invalidMsg = "Enter a valid IPv4 address for the PC.";
    expect(validateLanEndpoint("localhost", 9847)).toBe(invalidMsg);
    expect(validateLanEndpoint("192.168.1", 9847)).toBe(invalidMsg);
    expect(validateLanEndpoint("192.168.1.42.1", 9847)).toBe(invalidMsg);
    expect(validateLanEndpoint("192.168.a.42", 9847)).toBe(invalidMsg);
    expect(validateLanEndpoint("fe80::1", 9847)).toBe(invalidMsg);
    // Regex allows digits, so let's verify what the code specifically handles
    expect(validateLanEndpoint("1234.1.1.1", 9847)).toBe(invalidMsg); // 4 digits in first block
  });

  it("should handle valid format even if logically invalid IP due to regex limitation", () => {
    // The current regex /^\d{1,3}(\.\d{1,3}){3}$/ allows these
    expect(validateLanEndpoint("999.999.999.999", 9847)).toBeNull();
  });

  it("should return error for invalid port", () => {
    const portMsg = "Port must be between 1 and 65535.";
    expect(validateLanEndpoint("192.168.1.42", 0)).toBe(portMsg);
    expect(validateLanEndpoint("192.168.1.42", -1)).toBe(portMsg);
    expect(validateLanEndpoint("192.168.1.42", 65536)).toBe(portMsg);
  });
});

describe("parseLanEndpoint", () => {
  it("should parse host and port", () => {
    expect(parseLanEndpoint("192.168.1.42", 9847)).toEqual({ host: "192.168.1.42", port: 9847 });
  });

  it("should fallback to default port if input is missing or empty", () => {
    expect(parseLanEndpoint("", 9847)).toEqual({ host: "", port: 9847 });
    expect(parseLanEndpoint("", "")).toEqual({ host: "", port: 9847 });
  });

  it("should strip http:// and https://", () => {
    expect(parseLanEndpoint("http://192.168.1.42", 9847)).toEqual({ host: "192.168.1.42", port: 9847 });
    expect(parseLanEndpoint("https://10.0.0.1", 9847)).toEqual({ host: "10.0.0.1", port: 9847 });
  });

  it("should strip path", () => {
    expect(parseLanEndpoint("192.168.1.42/api/vault", 9847)).toEqual({ host: "192.168.1.42", port: 9847 });
    expect(parseLanEndpoint("http://192.168.1.42/foo/bar", 9847)).toEqual({ host: "192.168.1.42", port: 9847 });
  });

  it("should strip query string", () => {
    expect(parseLanEndpoint("192.168.1.42?foo=bar", 9847)).toEqual({ host: "192.168.1.42", port: 9847 });
  });

  it("should extract port from host if present", () => {
    expect(parseLanEndpoint("192.168.1.42:1234", 9847)).toEqual({ host: "192.168.1.42", port: 1234 });
    expect(parseLanEndpoint("http://192.168.1.42:1234/api", 9847)).toEqual({ host: "192.168.1.42", port: 1234 });
  });

  it("should trim trailing slashes", () => {
    expect(parseLanEndpoint("192.168.1.42/", 9847)).toEqual({ host: "192.168.1.42", port: 9847 });
  });
});
