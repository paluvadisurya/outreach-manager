import type { AppSettings, Contact } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";

/**
 * Derive the first name used for personalization.
 *
 * Rules (configurable via settings):
 *   - With the option enabled, a multi-word first name is reduced to its first
 *     word — "Ramesh Kumar" -> "Ramesh".
 *   - If that first word is shorter than `firstNameMinLength` it is treated as
 *     an initial, so the next word is kept too — "K Ramesh" -> "K Ramesh".
 *   - A single-word name is returned unchanged.
 *
 * `source` is the best available first name (the vCard given name, falling back
 * to the full name).
 */
export function deriveFirstName(
  source: string,
  settings: AppSettings = DEFAULT_SETTINGS,
): string {
  const trimmed = source.trim();
  if (!trimmed || !settings.firstNameFirstWordOnly) return trimmed;

  const words = trimmed.split(/\s+/);
  if (words.length <= 1) return words[0] ?? "";

  const first = words[0]!;
  if (first.length < settings.firstNameMinLength) {
    return `${first} ${words[1]}`.trim();
  }
  return first;
}

/**
 * Return a copy of a contact with its `firstName` reduced per the current
 * settings. Applied at render time (campaign generation and live previews) so
 * the personalization always reflects the latest settings, regardless of how
 * the contact was originally imported.
 */
export function personalizeContact<T extends Partial<Contact>>(
  contact: T,
  settings: AppSettings = DEFAULT_SETTINGS,
): T {
  return { ...contact, firstName: deriveFirstName(contact.firstName ?? "", settings) };
}
