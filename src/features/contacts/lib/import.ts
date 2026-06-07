import type { Contact, ParsedVCard } from "@/lib/types";
import { parseVCF } from "./vcf";
import {
  cardToContact,
  firstValidPhone,
  mergeCardIntoContact,
} from "./merge";

export interface ImportWarning {
  fullName: string;
  rawPhones: string[];
  reason: string;
}

export interface ImportSummary {
  /** Brand-new contacts that will be added to the database. */
  imported: number;
  /** Existing database contacts that were enriched with new information. */
  updated: number;
  /** Duplicate source records collapsed onto an already-seen contact. */
  merged: number;
  /** Records dropped because they had no valid phone number. */
  skipped: number;
  /**
   * Records skipped because their number belongs to a previously-removed contact
   * (no WhatsApp / out of domain). They are intentionally not re-added.
   */
  blocked: number;
  warnings: ImportWarning[];
}

export interface ImportResult {
  summary: ImportSummary;
  /** Contacts to persist (mix of new and updated). */
  upserts: Contact[];
}

/**
 * Pure import pipeline. Given parsed cards and the contacts already in the
 * database, compute the deduplicated, merged set of contacts to persist along
 * with a human-readable summary.
 *
 * Deduplication key: the normalized phone number. Records that share a number —
 * whether across files or with existing contacts — are merged into one.
 */
export function buildImport(
  cards: ParsedVCard[],
  existing: Contact[],
  now: number = Date.now(),
): ImportResult {
  // Working set keyed by normalized phone id, seeded with existing contacts.
  const working = new Map<string, Contact>();
  const existingIds = new Set<string>();
  for (const c of existing) {
    working.set(c.id, { ...c });
    existingIds.add(c.id);
  }

  const touchedThisRun = new Set<string>();
  const updatedIds = new Set<string>();
  const newIds = new Set<string>();

  let merged = 0;
  let skipped = 0;
  let blocked = 0;
  const warnings: ImportWarning[] = [];

  for (const card of cards) {
    const phone = firstValidPhone(card);
    if (!phone) {
      skipped++;
      warnings.push({
        fullName: card.fullName || "(no name)",
        rawPhones: card.phones,
        reason:
          card.phones.length === 0
            ? "No phone number"
            : "No valid phone number",
      });
      continue;
    }

    const id = phone.id;

    // Blocklist: a previously-removed contact must never be re-added. Skip the
    // card entirely and leave the removed record untouched.
    if (working.get(id)?.removed) {
      blocked++;
      warnings.push({
        fullName: card.fullName || "(no name)",
        rawPhones: card.phones,
        reason: "Previously removed, not re-added",
      });
      continue;
    }

    const alreadyExists = working.has(id);

    if (alreadyExists) {
      const base = working.get(id)!;
      const { contact, changed } = mergeCardIntoContact(base, card, now);
      working.set(id, contact);

      if (touchedThisRun.has(id)) {
        // Second+ source record for the same number this run → a duplicate.
        merged++;
      } else if (existingIds.has(id) && changed) {
        // First touch of a pre-existing DB contact that gained information.
        updatedIds.add(id);
      } else if (!existingIds.has(id)) {
        // Touching a contact created earlier in this same run again.
        merged++;
      }
    } else {
      working.set(id, cardToContact(card, phone, now));
      newIds.add(id);
    }

    touchedThisRun.add(id);
  }

  const originalById = new Map(existing.map((e) => [e.id, e]));

  // Persist any touched contact that is new or whose data actually changed.
  const upserts: Contact[] = [];
  for (const id of touchedThisRun) {
    const candidate = working.get(id);
    if (!candidate) continue;
    const original = originalById.get(id);
    if (!original || original.updatedAt !== candidate.updatedAt) {
      upserts.push(candidate);
    }
  }

  return {
    summary: {
      imported: newIds.size,
      updated: updatedIds.size,
      merged,
      skipped,
      blocked,
      warnings,
    },
    upserts,
  };
}

/** Convenience: parse multiple raw VCF file contents and import them together. */
export function buildImportFromFiles(
  fileContents: string[],
  existing: Contact[],
  now: number = Date.now(),
): ImportResult {
  const cards = fileContents.flatMap((text) => parseVCF(text));
  return buildImport(cards, existing, now);
}
