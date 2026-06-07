import { describe, it, expect } from "vitest";
import { buildImport, buildImportFromFiles } from "./import";
import { parseVCF } from "./vcf";

describe("buildImport", () => {
  it("imports new contacts and reports the count", () => {
    const cards = parseVCF(
      [
        "BEGIN:VCARD\nFN:A One\nTEL:9876543210\nEND:VCARD",
        "BEGIN:VCARD\nFN:B Two\nTEL:9886077665\nEND:VCARD",
      ].join("\n"),
    );
    const result = buildImport(cards, [], 1000);
    expect(result.summary.imported).toBe(2);
    expect(result.upserts).toHaveLength(2);
  });

  it("skips records without a valid phone and records a warning", () => {
    const cards = parseVCF(
      "BEGIN:VCARD\nFN:No Phone\nEMAIL:x@y.com\nNOTE:n\nEND:VCARD",
    );
    // A card with no TEL still parses (it has a name); import must skip it.
    const result = buildImport(
      [{ ...cards[0]!, phones: [] }],
      [],
      1000,
    );
    expect(result.summary.skipped).toBe(1);
    expect(result.summary.imported).toBe(0);
    expect(result.summary.warnings).toHaveLength(1);
  });

  it("deduplicates two records that share a phone number, merging fields", () => {
    const cards = parseVCF(
      [
        "BEGIN:VCARD\nFN:Ramesh\nTEL:+91 98765 43210\nEND:VCARD",
        "BEGIN:VCARD\nFN:Ramesh Kumar\nTEL:9876543210\nEMAIL:ramesh@example.com\nORG:Kumar Estates\nEND:VCARD",
      ].join("\n"),
    );
    const result = buildImport(cards, [], 1000);
    expect(result.summary.imported).toBe(1);
    expect(result.summary.merged).toBe(1);
    expect(result.upserts).toHaveLength(1);
    expect(result.upserts[0]!.email).toBe("ramesh@example.com");
    expect(result.upserts[0]!.company).toBe("Kumar Estates");
  });

  it("updates an existing contact with new information on re-import", () => {
    const first = buildImport(
      parseVCF("BEGIN:VCARD\nFN:Ramesh\nTEL:9876543210\nEND:VCARD"),
      [],
      1000,
    );
    const existing = first.upserts;

    const second = buildImport(
      parseVCF(
        "BEGIN:VCARD\nFN:Ramesh\nTEL:9876543210\nEMAIL:new@example.com\nEND:VCARD",
      ),
      existing,
      2000,
    );
    expect(second.summary.imported).toBe(0);
    expect(second.summary.updated).toBe(1);
    expect(second.upserts[0]!.email).toBe("new@example.com");
  });

  it("does not re-persist identical records on re-import", () => {
    const vcf = "BEGIN:VCARD\nFN:Ramesh\nTEL:9876543210\nEMAIL:a@b.com\nEND:VCARD";
    const first = buildImport(parseVCF(vcf), [], 1000);
    const second = buildImport(parseVCF(vcf), first.upserts, 2000);
    expect(second.summary.updated).toBe(0);
    expect(second.upserts).toHaveLength(0);
  });

  it("blocks re-import of a previously-removed contact", () => {
    const first = buildImport(
      parseVCF("BEGIN:VCARD\nFN:Ramesh\nTEL:9876543210\nEND:VCARD"),
      [],
      1000,
    );
    // Simulate the contact having been soft-removed (no WhatsApp / out of domain).
    const removed = first.upserts.map((c) => ({
      ...c,
      removed: true,
      removedAt: 1500,
    }));

    const second = buildImport(
      parseVCF(
        "BEGIN:VCARD\nFN:Ramesh\nTEL:9876543210\nEMAIL:new@example.com\nEND:VCARD",
      ),
      removed,
      2000,
    );
    expect(second.summary.blocked).toBe(1);
    expect(second.summary.imported).toBe(0);
    expect(second.summary.updated).toBe(0);
    // The removed record is left untouched — nothing to persist.
    expect(second.upserts).toHaveLength(0);
  });

  it("merges across multiple files by phone number", () => {
    const fileA = "BEGIN:VCARD\nFN:Anita\nTEL:9886077665\nEND:VCARD";
    const fileB =
      "BEGIN:VCARD\nFN:Anita Sharma\nTEL:+91 98860 77665\nEMAIL:anita@example.com\nEND:VCARD";
    const result = buildImportFromFiles([fileA, fileB], [], 1000);
    expect(result.summary.imported).toBe(1);
    expect(result.summary.merged).toBe(1);
    expect(result.upserts[0]!.email).toBe("anita@example.com");
  });
});
