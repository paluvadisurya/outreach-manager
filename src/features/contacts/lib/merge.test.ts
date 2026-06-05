import { describe, it, expect } from "vitest";
import type { ParsedVCard } from "@/lib/types";
import {
  firstValidPhone,
  cardToContact,
  mergeCardIntoContact,
  buildSearchIndex,
} from "./merge";

function card(partial: Partial<ParsedVCard>): ParsedVCard {
  return {
    firstName: "",
    lastName: "",
    fullName: "",
    phones: [],
    ...partial,
  };
}

describe("firstValidPhone", () => {
  it("returns the first valid phone, skipping invalid ones", () => {
    const c = card({ phones: ["nope", "9876543210"] });
    expect(firstValidPhone(c)?.id).toBe("+919876543210");
  });

  it("returns null when no phone is valid", () => {
    expect(firstValidPhone(card({ phones: ["x", "123"] }))).toBeNull();
  });
});

describe("mergeCardIntoContact", () => {
  it("fills missing fields from the incoming card (Record A + Record B)", () => {
    const phone = firstValidPhone(card({ phones: ["9876543210"] }))!;
    const recordA = cardToContact(
      card({ fullName: "Ramesh", firstName: "Ramesh", phones: ["9876543210"] }),
      phone,
      1000,
    );

    const recordB = card({
      fullName: "Ramesh Kumar",
      phones: ["9876543210"],
      email: "ramesh@example.com",
      company: "Kumar Estates",
    });

    const { contact, changed } = mergeCardIntoContact(recordA, recordB, 2000);
    expect(changed).toBe(true);
    expect(contact.email).toBe("ramesh@example.com");
    expect(contact.company).toBe("Kumar Estates");
    expect(contact.updatedAt).toBe(2000);
  });

  it("does not overwrite existing non-empty values", () => {
    const phone = firstValidPhone(card({ phones: ["9876543210"] }))!;
    const existing = cardToContact(
      card({
        fullName: "Ramesh",
        phones: ["9876543210"],
        email: "old@example.com",
      }),
      phone,
      1000,
    );
    const { contact } = mergeCardIntoContact(
      existing,
      card({ email: "new@example.com", phones: ["9876543210"] }),
      2000,
    );
    expect(contact.email).toBe("old@example.com");
  });

  it("reports no change when the card adds nothing", () => {
    const phone = firstValidPhone(card({ phones: ["9876543210"] }))!;
    const existing = cardToContact(
      card({ fullName: "Ramesh", phones: ["9876543210"], email: "a@b.com" }),
      phone,
      1000,
    );
    const { changed } = mergeCardIntoContact(
      existing,
      card({ phones: ["9876543210"] }),
      2000,
    );
    expect(changed).toBe(false);
  });
});

describe("buildSearchIndex", () => {
  it("lowercases and joins searchable fields", () => {
    const idx = buildSearchIndex({
      fullName: "Ramesh Kumar",
      phone: "+91 98765 43210",
      email: "ramesh@example.com",
      company: "Kumar Estates",
      designation: "Director",
      notes: "Whitefield",
    });
    expect(idx).toContain("ramesh kumar");
    expect(idx).toContain("whitefield");
    expect(idx).toContain("director");
  });
});
