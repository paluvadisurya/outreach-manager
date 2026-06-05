import type { ParsedVCard } from "@/lib/types";

/**
 * A small, dependency-free vCard parser covering the fields this product needs
 * (name, phone, email, company, designation, notes). It tolerates vCard 2.1,
 * 3.0 and 4.0 quirks: line folding, parameter lists, grouped properties and
 * quoted-printable soft line breaks.
 *
 * It intentionally does not aim to be a complete RFC 6350 implementation — it
 * extracts what outreach needs and ignores the rest.
 */

/** Unfold a raw vCard text: continuation lines start with a space or tab. */
function unfoldLines(input: string): string[] {
  const rawLines = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const lines: string[] = [];

  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

interface ParsedProperty {
  name: string;
  params: Record<string, string[]>;
  value: string;
}

/** Parse a single content line like `TEL;TYPE=CELL:+91 98765 43210`. */
function parseLine(line: string): ParsedProperty | null {
  const colonIndex = line.indexOf(":");
  if (colonIndex === -1) return null;

  const rawKey = line.slice(0, colonIndex);
  const rawValue = line.slice(colonIndex + 1);

  const keyParts = rawKey.split(";");
  // Strip a leading group label (e.g. "item1.TEL" -> "TEL").
  const namePart = keyParts[0] ?? "";
  const name = (namePart.includes(".")
    ? namePart.slice(namePart.indexOf(".") + 1)
    : namePart
  )
    .trim()
    .toUpperCase();

  const params: Record<string, string[]> = {};
  for (const part of keyParts.slice(1)) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq === -1) {
      // vCard 2.1 bare params, e.g. `TEL;CELL:` -> TYPE=CELL
      (params.TYPE ??= []).push(part.trim().toUpperCase());
    } else {
      const pName = part.slice(0, eq).trim().toUpperCase();
      const pVals = part
        .slice(eq + 1)
        .split(",")
        .map((v) => v.trim().toUpperCase());
      (params[pName] ??= []).push(...pVals);
    }
  }

  return { name, params, value: rawValue };
}

/** Decode quoted-printable values when the ENCODING parameter requests it. */
function decodeValue(prop: ParsedProperty): string {
  const encodings = prop.params.ENCODING ?? [];
  let value = prop.value;
  if (encodings.includes("QUOTED-PRINTABLE")) {
    value = value
      .replace(/=\n/g, "")
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16)),
      );
  }
  return value;
}

/** Split a structured value (N field) honoring backslash escapes. */
function splitStructured(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "\\" && i + 1 < value.length) {
      current += value[i + 1];
      i++;
    } else if (ch === ";") {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function buildCard(props: ParsedProperty[]): ParsedVCard | null {
  let firstName = "";
  let lastName = "";
  let fullName = "";
  const phones: string[] = [];
  let email: string | undefined;
  let company: string | undefined;
  let designation: string | undefined;
  let notes: string | undefined;

  for (const prop of props) {
    const value = decodeValue(prop);
    switch (prop.name) {
      case "N": {
        const [family = "", given = ""] = splitStructured(value);
        lastName = unescapeText(family);
        firstName = unescapeText(given);
        break;
      }
      case "FN":
        fullName = unescapeText(value);
        break;
      case "TEL":
        if (value.trim()) phones.push(value.trim());
        break;
      case "EMAIL":
        if (!email && value.trim()) email = unescapeText(value);
        break;
      case "ORG":
        if (!company && value.trim()) {
          // ORG is structured (Company;Unit) — take the first component.
          company = unescapeText(splitStructured(value)[0] ?? value);
        }
        break;
      case "TITLE":
        if (!designation && value.trim()) designation = unescapeText(value);
        break;
      case "NOTE":
        if (!notes && value.trim()) notes = unescapeText(value);
        break;
      default:
        break;
    }
  }

  // Derive any missing name fields from what we have.
  if (!fullName) {
    fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  }
  if (!firstName && !lastName && fullName) {
    const segments = fullName.split(/\s+/);
    firstName = segments[0] ?? "";
    lastName = segments.slice(1).join(" ");
  }

  // A card with neither a name nor a phone carries no useful information.
  if (!fullName && phones.length === 0) return null;

  return {
    firstName,
    lastName,
    fullName,
    phones,
    email,
    company,
    designation,
    notes,
  };
}

/**
 * Parse the full text of a `.vcf` file (which may contain many cards) into an
 * array of structured records. Malformed cards are skipped silently; the import
 * pipeline is responsible for surfacing records that lack a valid phone number.
 */
export function parseVCF(text: string): ParsedVCard[] {
  const lines = unfoldLines(text);
  const cards: ParsedVCard[] = [];
  let current: ParsedProperty[] | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^BEGIN:VCARD$/i.test(trimmed)) {
      current = [];
      continue;
    }
    if (/^END:VCARD$/i.test(trimmed)) {
      if (current) {
        const card = buildCard(current);
        if (card) cards.push(card);
      }
      current = null;
      continue;
    }
    if (current && trimmed) {
      const prop = parseLine(line);
      if (prop) current.push(prop);
    }
  }

  return cards;
}
