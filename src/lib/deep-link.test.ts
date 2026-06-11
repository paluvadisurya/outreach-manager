import { describe, it, expect } from "vitest";
import { nextDeepLinkTarget, safeReturnPath } from "./deep-link";

describe("nextDeepLinkTarget", () => {
  it("returns null when there is no parameter", () => {
    expect(nextDeepLinkTarget(null, null)).toBeNull();
    expect(nextDeepLinkTarget("+919000000001", null)).toBeNull();
  });

  it("acts on a fresh target", () => {
    expect(nextDeepLinkTarget(null, "+919000000001")).toBe("+919000000001");
  });

  it("ignores a target it has already acted on (no re-open churn)", () => {
    expect(nextDeepLinkTarget("+919000000001", "+919000000001")).toBeNull();
  });

  it("acts again when the target CHANGES on a reused screen", () => {
    // The regression at the heart of the bug: the screen was kept alive across a
    // soft navigation and the parameter changed from one person to another.
    expect(nextDeepLinkTarget("+919000000001", "+919000000002")).toBe(
      "+919000000002",
    );
  });
});

describe("safeReturnPath", () => {
  it("accepts internal paths", () => {
    expect(safeReturnPath("/campaigns/abc")).toBe("/campaigns/abc");
  });

  it("rejects empty, missing, or external destinations", () => {
    expect(safeReturnPath(null)).toBeNull();
    expect(safeReturnPath("")).toBeNull();
    expect(safeReturnPath("https://evil.example.com")).toBeNull();
    expect(safeReturnPath("javascript:alert(1)")).toBeNull();
  });
});
