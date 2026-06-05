import { describe, it, expect } from "vitest";
import { parseVCF } from "./vcf";

describe("parseVCF", () => {
  it("parses a basic 3.0 card", () => {
    const text = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Kumar;Ramesh;;;",
      "FN:Ramesh Kumar",
      "TEL;TYPE=CELL:+91 98765 43210",
      "EMAIL:ramesh@example.com",
      "ORG:Kumar Estates",
      "TITLE:Director",
      "NOTE:Villa buyer",
      "END:VCARD",
    ].join("\n");

    const [card] = parseVCF(text);
    expect(card).toBeDefined();
    expect(card!.firstName).toBe("Ramesh");
    expect(card!.lastName).toBe("Kumar");
    expect(card!.fullName).toBe("Ramesh Kumar");
    expect(card!.phones).toEqual(["+91 98765 43210"]);
    expect(card!.email).toBe("ramesh@example.com");
    expect(card!.company).toBe("Kumar Estates");
    expect(card!.designation).toBe("Director");
    expect(card!.notes).toBe("Villa buyer");
  });

  it("parses multiple cards in one file", () => {
    const text = [
      "BEGIN:VCARD\nFN:A\nTEL:9876543210\nEND:VCARD",
      "BEGIN:VCARD\nFN:B\nTEL:9886077665\nEND:VCARD",
    ].join("\n");
    expect(parseVCF(text)).toHaveLength(2);
  });

  it("derives a full name from N when FN is missing", () => {
    const [card] = parseVCF(
      "BEGIN:VCARD\nN:Sharma;Anita;;;\nTEL:9886077665\nEND:VCARD",
    );
    expect(card!.fullName).toBe("Anita Sharma");
  });

  it("splits a full name into first/last when only FN is present", () => {
    const [card] = parseVCF(
      "BEGIN:VCARD\nFN:Priya Iyer\nTEL:9900112233\nEND:VCARD",
    );
    expect(card!.firstName).toBe("Priya");
    expect(card!.lastName).toBe("Iyer");
  });

  it("handles line folding (continuation lines)", () => {
    const text =
      "BEGIN:VCARD\nFN:Long Note Person\nTEL:9876543210\nNOTE:This is a very\n  long folded note\nEND:VCARD";
    const [card] = parseVCF(text);
    expect(card!.notes).toBe("This is a very long folded note");
  });

  it("handles CRLF line endings", () => {
    const text =
      "BEGIN:VCARD\r\nFN:CR Lf\r\nTEL:9876543210\r\nEND:VCARD\r\n";
    expect(parseVCF(text)).toHaveLength(1);
  });

  it("collects multiple phone numbers", () => {
    const [card] = parseVCF(
      "BEGIN:VCARD\nFN:Two Phones\nTEL;TYPE=CELL:9876543210\nTEL;TYPE=WORK:9886077665\nEND:VCARD",
    );
    expect(card!.phones).toHaveLength(2);
  });

  it("ignores cards with neither a name nor a phone", () => {
    expect(parseVCF("BEGIN:VCARD\nEMAIL:x@y.com\nEND:VCARD")).toHaveLength(0);
  });

  it("takes the first ORG component", () => {
    const [card] = parseVCF(
      "BEGIN:VCARD\nFN:Org Test\nTEL:9876543210\nORG:Acme;Sales Unit\nEND:VCARD",
    );
    expect(card!.company).toBe("Acme");
  });
});
