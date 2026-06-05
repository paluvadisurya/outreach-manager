import { describe, it, expect } from "vitest";
import { normalizePhone, isValidPhone } from "./phone";

describe("normalizePhone", () => {
  it("resolves different formats of the same Indian number to one identifier", () => {
    const variants = [
      "+91 9876543210",
      "9876543210",
      "91-9876543210",
      "+91-98765-43210",
      "(+91) 98765 43210",
    ];
    const ids = variants.map((v) => normalizePhone(v)?.id);
    for (const id of ids) {
      expect(id).toBe("+919876543210");
    }
  });

  it("produces a digits-only wa.me number", () => {
    expect(normalizePhone("+91 98765 43210")?.waNumber).toBe("919876543210");
  });

  it("returns null for empty or missing input", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });

  it("rejects values that are too short to be phone numbers", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
  });

  it("does not double-prefix a number that already has 91", () => {
    expect(normalizePhone("919876543210")?.id).toBe("+919876543210");
    expect(normalizePhone("+919876543210")?.id).toBe("+919876543210");
  });

  it("collapses a number that was wrongly prefixed multiple times", () => {
    // Regression: a contact saved with +91 that got 91 prepended again.
    expect(normalizePhone("+91919676887489")?.id).toBe("+919676887489");
    expect(normalizePhone("919676887489")?.id).toBe("+919676887489");
  });

  it("strips a national trunk zero", () => {
    expect(normalizePhone("09876543210")?.id).toBe("+919876543210");
  });

  it("treats a genuine 10-digit number starting with 91 as national", () => {
    // 9191234567 is a valid 10-digit mobile and must not lose its leading 91.
    expect(normalizePhone("9191234567")?.id).toBe("+919191234567");
  });

  it("keeps distinct numbers distinct", () => {
    const a = normalizePhone("9886077665")?.id;
    const b = normalizePhone("9986077665")?.id;
    expect(a).not.toBe(b);
  });

  it("isValidPhone reflects normalizePhone", () => {
    expect(isValidPhone("+91 98765 43210")).toBe(true);
    expect(isValidPhone("nope")).toBe(false);
  });
});
