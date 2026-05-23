import { describe, it, expect } from "vitest";
import { parseLanEndpoint } from "./lanSync";

describe("parseLanEndpoint", () => {
  it("should handle empty host input", () => {
    expect(parseLanEndpoint("", 1234)).toEqual({ host: "", port: 1234 });
    expect(parseLanEndpoint("   ", "5678")).toEqual({ host: "", port: 5678 });
    expect(parseLanEndpoint("", "invalid_port")).toEqual({ host: "", port: 9847 });
  });

  it("should parse a basic host without port", () => {
    expect(parseLanEndpoint("192.168.1.5", 3000)).toEqual({ host: "192.168.1.5", port: 3000 });
    expect(parseLanEndpoint("localhost", "8080")).toEqual({ host: "localhost", port: 8080 });
  });

  it("should strip http:// and https:// protocols", () => {
    expect(parseLanEndpoint("http://192.168.1.5", 3000)).toEqual({ host: "192.168.1.5", port: 3000 });
    expect(parseLanEndpoint("https://10.0.0.1", 4000)).toEqual({ host: "10.0.0.1", port: 4000 });
    expect(parseLanEndpoint("HTTP://localhost", 5000)).toEqual({ host: "localhost", port: 5000 });
  });

  it("should strip trailing paths", () => {
    expect(parseLanEndpoint("192.168.1.5/api/vault", 3000)).toEqual({ host: "192.168.1.5", port: 3000 });
    expect(parseLanEndpoint("http://10.0.0.1/api/", 4000)).toEqual({ host: "10.0.0.1", port: 4000 });
    expect(parseLanEndpoint("localhost/", 5000)).toEqual({ host: "localhost", port: 5000 });
  });

  it("should strip query parameters", () => {
    expect(parseLanEndpoint("192.168.1.5?token=123", 3000)).toEqual({ host: "192.168.1.5", port: 3000 });
    expect(parseLanEndpoint("http://10.0.0.1/api?force=true", 4000)).toEqual({ host: "10.0.0.1", port: 4000 });
  });

  it("should extract port from host and override portInput", () => {
    expect(parseLanEndpoint("192.168.1.5:8080", 3000)).toEqual({ host: "192.168.1.5", port: 8080 });
    expect(parseLanEndpoint("localhost:9000", "5000")).toEqual({ host: "localhost", port: 9000 });
  });

  it("should handle complex combinations", () => {
    expect(parseLanEndpoint("https://192.168.1.5:8080/api/vault?q=1", 3000)).toEqual({ host: "192.168.1.5", port: 8080 });
    expect(parseLanEndpoint("http://localhost:5000/?foo=bar", 80)).toEqual({ host: "localhost", port: 5000 });
    expect(parseLanEndpoint("   http://10.0.0.2:4000/   ", 8080)).toEqual({ host: "10.0.0.2", port: 4000 });
  });

  it("should fallback to default port 9847 if portInput is invalid and no inline port", () => {
    expect(parseLanEndpoint("192.168.1.5", "invalid")).toEqual({ host: "192.168.1.5", port: 9847 });
    expect(parseLanEndpoint("192.168.1.5", 0)).toEqual({ host: "192.168.1.5", port: 9847 });
  });
});
