import { describe, it, expect } from "vitest";
import { isNewerVersion } from "@/shared/updateService";

describe("updateService - isNewerVersion", () => {
  it("detects newer major version", () => {
    expect(isNewerVersion("1.0.0", "2.0.0")).toBe(true);
    expect(isNewerVersion("2.0.0", "1.0.0")).toBe(false);
  });

  it("detects newer minor version", () => {
    expect(isNewerVersion("1.0.0", "1.1.0")).toBe(true);
    expect(isNewerVersion("1.1.0", "1.0.5")).toBe(false);
  });

  it("detects newer patch version", () => {
    expect(isNewerVersion("1.0.0", "1.0.1")).toBe(true);
    expect(isNewerVersion("1.0.1", "1.0.0")).toBe(false);
  });

  it("handles 'v' prefix in tags", () => {
    expect(isNewerVersion("1.0.0", "v1.2.0")).toBe(true);
    expect(isNewerVersion("v1.0.0", "v1.0.0")).toBe(false);
  });

  it("handles identical versions", () => {
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
  });

  it("handles mismatched segment lengths", () => {
    expect(isNewerVersion("1.0", "1.0.1")).toBe(true);
    expect(isNewerVersion("1.0.1", "1.0")).toBe(false);
  });

  it("handles beta prerelease iterations correctly", () => {
    expect(isNewerVersion("1.0.9-beta.6", "1.0.9-beta.7")).toBe(true);
    expect(isNewerVersion("1.0.9-beta.7", "1.0.9-beta.6")).toBe(false);
    expect(isNewerVersion("1.0.9-beta.6", "1.0.9")).toBe(true);
  });
});
