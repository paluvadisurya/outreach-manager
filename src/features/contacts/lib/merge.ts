import type { Contact, ParsedVCard } from "@/lib/types";
import { normalizePhone, type NormalizedPhone } from "./phone";

/** Build the lowercased search index from a contact's searchable fields. */
export function buildSearchIndex(
  c: Pick<
    Contact,
    "fullName" | "phone" | "company" | "designation" | "notes" | "email"
  >,
): string {
  return [c.fullName, c.phone, c.email, c.company, c.designation, c.notes]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Pick the first valid phone from a card, if any. */
export function firstValidPhone(card: ParsedVCard): NormalizedPhone | null {
  for (const raw of card.phones) {
    const normalized = normalizePhone(raw);
    if (normalized) return normalized;
  }
  return null;
}

/**
 * Create a fresh Contact from a parsed card and its normalized phone. The full
 * given name is stored verbatim; first-name trimming for personalization is
 * applied later, at render time, so it always honors the current settings.
 */
export function cardToContact(
  card: ParsedVCard,
  phone: NormalizedPhone,
  now: number,
): Contact {
  const base: Omit<Contact, "searchIndex"> = {
    id: phone.id,
    phone: phone.display,
    rawPhone: card.phones[0] ?? phone.display,
    firstName: card.firstName || card.fullName,
    lastName: card.lastName,
    fullName: card.fullName,
    email: card.email,
    company: card.company,
    designation: card.designation,
    notes: card.notes,
    categoryIds: [],
    createdAt: now,
    updatedAt: now,
  };
  return { ...base, searchIndex: buildSearchIndex(base) };
}

/**
 * Merge a parsed card into an existing contact. Existing non-empty values are
 * preserved; the card only fills in fields that are currently missing. The
 * richer of the two names wins. Returns the merged contact plus whether any
 * field actually changed (so callers can distinguish updates from no-ops).
 */
export function mergeCardIntoContact(
  existing: Contact,
  card: ParsedVCard,
  now: number,
): { contact: Contact; changed: boolean } {
  const merged: Contact = { ...existing };
  let changed = false;

  const fill = (key: "email" | "company" | "designation" | "notes") => {
    const incoming = card[key];
    if (incoming && !merged[key]) {
      merged[key] = incoming;
      changed = true;
    }
  };

  fill("email");
  fill("company");
  fill("designation");
  fill("notes");

  // Prefer a fuller name when the existing one is empty or clearly shorter.
  if (!merged.fullName && card.fullName) {
    merged.fullName = card.fullName;
    changed = true;
  }
  if (!merged.firstName && (card.firstName || card.fullName)) {
    merged.firstName = card.firstName || card.fullName;
    changed = true;
  }
  if (!merged.lastName && card.lastName) {
    merged.lastName = card.lastName;
    changed = true;
  }

  if (changed) {
    merged.updatedAt = now;
    merged.searchIndex = buildSearchIndex(merged);
  }

  return { contact: merged, changed };
}
