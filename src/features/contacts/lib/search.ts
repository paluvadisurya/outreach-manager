import type { Contact } from "@/lib/types";

/**
 * Filter contacts by a free-text query. Matching is performed against each
 * contact's precomputed `searchIndex` (name, phone, email, company,
 * designation, notes). Every whitespace-separated term in the query must match,
 * which lets users narrow results progressively (e.g. "whitefield villa").
 *
 * The function is pure and works on an in-memory array — fast enough for tens of
 * thousands of contacts and easy to unit test.
 */
export function filterContacts(contacts: Contact[], query: string): Contact[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return contacts;
  return contacts.filter((c) =>
    terms.every((term) => c.searchIndex.includes(term)),
  );
}

/**
 * Compute the set of contact ids produced by "Select Search Results": exactly
 * the contacts matching the current query, never the whole database. When the
 * query is empty there is no active search, so nothing is selected.
 */
export function selectSearchResults(
  contacts: Contact[],
  query: string,
): string[] {
  if (query.trim() === "") return [];
  return filterContacts(contacts, query).map((c) => c.id);
}
