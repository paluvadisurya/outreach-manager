import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type Contact,
} from "@/lib/types";
import { deriveFirstName, personalizeContact } from "./name";

const settings: AppSettings = { ...DEFAULT_SETTINGS };

describe("deriveFirstName", () => {
  it("takes only the first word of a multi-word name", () => {
    expect(deriveFirstName("Ramesh Kumar", settings)).toBe("Ramesh");
    expect(deriveFirstName("Abhijit Uber", settings)).toBe("Abhijit");
  });

  it("keeps a single-word name as-is", () => {
    expect(deriveFirstName("Ramesh", settings)).toBe("Ramesh");
  });

  it("appends the next word when the first word is an initial", () => {
    expect(deriveFirstName("K Ramesh", settings)).toBe("K Ramesh");
    expect(deriveFirstName("A B Sharma", settings)).toBe("A B");
  });

  it("respects a custom minimum length", () => {
    const custom = { ...settings, firstNameMinLength: 4 };
    expect(deriveFirstName("Sai Kumar", custom)).toBe("Sai Kumar");
    expect(deriveFirstName("Ramesh Kumar", custom)).toBe("Ramesh");
  });

  it("returns the whole name when the option is disabled", () => {
    const off = { ...settings, firstNameFirstWordOnly: false };
    expect(deriveFirstName("Ramesh Kumar", off)).toBe("Ramesh Kumar");
  });

  it("trims and tolerates empty input", () => {
    expect(deriveFirstName("   ", settings)).toBe("");
    expect(deriveFirstName("  Ramesh  Kumar ", settings)).toBe("Ramesh");
  });
});

describe("personalizeContact", () => {
  it("reduces the contact's first name without touching other fields", () => {
    const result = personalizeContact(
      { firstName: "Ayush Unni SusTech", fullName: "Ayush Unni SusTech Uber" },
      settings,
    );
    expect(result.firstName).toBe("Ayush");
    expect(result.fullName).toBe("Ayush Unni SusTech Uber");
  });

  it("handles a missing first name", () => {
    const empty: Partial<Contact> = {};
    expect(personalizeContact(empty, settings).firstName).toBe("");
  });
});
