import { describe, it, expect } from "vitest";
import type { Contact } from "@/lib/types";
import { filterContacts, selectSearchResults } from "./search";
import { buildSearchIndex } from "./merge";

function contact(partial: Partial<Contact> & { id: string }): Contact {
  const base = {
    phone: "",
    rawPhone: "",
    firstName: "",
    lastName: "",
    fullName: "",
    categoryIds: [],
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  } as Contact;
  return { ...base, searchIndex: buildSearchIndex(base) };
}

const contacts: Contact[] = [
  contact({ id: "1", fullName: "Whitefield Buyer Lead", company: "Acme" }),
  contact({ id: "2", fullName: "Whitefield Referral Partner" }),
  contact({ id: "3", fullName: "Whitefield Investor", notes: "villa" }),
  contact({ id: "4", fullName: "Sarjapur Site Visit Lead" }),
];

describe("filterContacts", () => {
  it("matches against name", () => {
    expect(filterContacts(contacts, "whitefield")).toHaveLength(3);
  });

  it("requires every term to match (progressive narrowing)", () => {
    expect(filterContacts(contacts, "whitefield villa")).toHaveLength(1);
  });

  it("returns all contacts for an empty query", () => {
    expect(filterContacts(contacts, "")).toHaveLength(4);
  });

  it("matches company and notes too", () => {
    expect(filterContacts(contacts, "acme")).toHaveLength(1);
    expect(filterContacts(contacts, "villa")).toHaveLength(1);
  });
});

describe("selectSearchResults", () => {
  it("selects only the filtered contacts, never the whole database", () => {
    const ids = selectSearchResults(contacts, "whitefield");
    expect(ids.sort()).toEqual(["1", "2", "3"]);
  });

  it("selects nothing when there is no active search", () => {
    expect(selectSearchResults(contacts, "")).toEqual([]);
    expect(selectSearchResults(contacts, "   ")).toEqual([]);
  });
});
