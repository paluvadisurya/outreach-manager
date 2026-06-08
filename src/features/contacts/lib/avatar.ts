/**
 * Deterministic initials-avatar styling shared by the contact list, the call
 * list and the category members view, so a person looks the same everywhere.
 * Pure presentation — no DB access.
 */

/** Soft pastel avatar palette, chosen deterministically from a stable key. */
const AVATAR_TINTS = [
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
  "bg-emerald-100 text-emerald-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700",
  "bg-fuchsia-100 text-fuchsia-700",
  "bg-indigo-100 text-indigo-700",
];

/** Up to two uppercase initials from a name, or "?" when empty. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** A stable tint class for a key (e.g. a contact id), so colours don't flicker. */
export function tintFor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return AVATAR_TINTS[Math.abs(hash) % AVATAR_TINTS.length]!;
}
