import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/types";
import { shortlistCsv } from "./shortlistExport";

function contact(over: Partial<Contact> & { id: string }): Contact {
  return {
    phone: over.id,
    rawPhone: over.id,
    firstName: "",
    lastName: "",
    fullName: "",
    categoryIds: [],
    searchIndex: "",
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

describe("shortlistCsv", () => {
  it("emits a header row even with no members", () => {
    const csv = shortlistCsv([]);
    expect(csv.split("\r\n")).toHaveLength(1);
    expect(csv).toContain("Name");
    expect(csv).toContain("Phone");
  });

  it("writes one row per member with the expected columns", () => {
    const csv = shortlistCsv([
      contact({
        id: "+919000000001",
        fullName: "Asha Rao",
        phone: "+919000000001",
        company: "Acme",
      }),
    ]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("Asha Rao");
    expect(lines[1]).toContain("Acme");
  });

  it("escapes quotes and flattens newlines in fields", () => {
    const csv = shortlistCsv([
      contact({
        id: "x",
        fullName: 'A "Big" Client',
        notes: "line one\nline two",
      }),
    ]);
    expect(csv).toContain('"A ""Big"" Client"');
    expect(csv).toContain("line one line two");
  });
});
