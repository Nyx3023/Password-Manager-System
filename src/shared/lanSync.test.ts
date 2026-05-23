import { describe, it, expect } from "vitest";
import { parseLanEndpoint } from "./lanSync";

describe("parseLanEndpoint", () => {
  it("handles empty host input", () => {
    expect(parseLanEndpoint("", 8080)).toEqual({ host: "", port: 8080 });
    expect(parseLanEndpoint("   ", "8080")).toEqual({ host: "", port: 8080 });
    expect(parseLanEndpoint("", "")).toEqual({ host: "", port: 9847 });
  });

  it("handles basic IP address + port", () => {
    expect(parseLanEndpoint("192.168.1.5", 8080)).toEqual({ host: "192.168.1.5", port: 8080 });
    expect(parseLanEndpoint("192.168.1.5", "8080")).toEqual({ host: "192.168.1.5", port: 8080 });
    expect(parseLanEndpoint("10.0.0.1", "")).toEqual({ host: "10.0.0.1", port: 9847 });
  });

  it("strips protocol", () => {
    expect(parseLanEndpoint("http://192.168.1.5", 8080)).toEqual({ host: "192.168.1.5", port: 8080 });
    expect(parseLanEndpoint("https://192.168.1.5", 8080)).toEqual({ host: "192.168.1.5", port: 8080 });
    expect(parseLanEndpoint("HTTP://192.168.1.5", 8080)).toEqual({ host: "192.168.1.5", port: 8080 });
  });

  it("strips path and query string", () => {
    expect(parseLanEndpoint("192.168.1.5/api/vault", 8080)).toEqual({ host: "192.168.1.5", port: 8080 });
    expect(parseLanEndpoint("192.168.1.5?query=1", 8080)).toEqual({ host: "192.168.1.5", port: 8080 });
    expect(parseLanEndpoint("192.168.1.5/path?query=1", 8080)).toEqual({ host: "192.168.1.5", port: 8080 });
    expect(parseLanEndpoint("192.168.1.5/?query=1", 8080)).toEqual({ host: "192.168.1.5", port: 8080 });
    expect(parseLanEndpoint("192.168.1.5/", 8080)).toEqual({ host: "192.168.1.5", port: 8080 });
  });

  it("extracts port from inline host input", () => {
    expect(parseLanEndpoint("192.168.1.5:8081", 8080)).toEqual({ host: "192.168.1.5", port: 8081 });
    expect(parseLanEndpoint("http://192.168.1.5:8081/path", 8080)).toEqual({ host: "192.168.1.5", port: 8081 });
  });

  it("handles invalid port inputs falling back to default port 9847", () => {
    expect(parseLanEndpoint("192.168.1.5", "invalid")).toEqual({ host: "192.168.1.5", port: 9847 });
    expect(parseLanEndpoint("192.168.1.5", NaN)).toEqual({ host: "192.168.1.5", port: 9847 });
  });

  it("handles whitespace trimming", () => {
    expect(parseLanEndpoint("  192.168.1.5  ", 8080)).toEqual({ host: "192.168.1.5", port: 8080 });
    expect(parseLanEndpoint("  http://192.168.1.5:8081/path  ", 8080)).toEqual({ host: "192.168.1.5", port: 8081 });
  });
});
