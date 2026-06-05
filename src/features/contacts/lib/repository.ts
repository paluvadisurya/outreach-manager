import type { Contact, ParsedVCard } from "@/lib/types";
import { getDB } from "@/lib/db/db";
import { buildImport, type ImportResult } from "./import";

export const contactsRepo = {
  async all(): Promise<Contact[]> {
    return getDB().contacts.orderBy("fullName").toArray();
  },

  async get(id: string): Promise<Contact | undefined> {
    return getDB().contacts.get(id);
  },

  async count(): Promise<number> {
    return getDB().contacts.count();
  },

  /**
   * Compute what an import would do without writing anything. The UI shows this
   * summary (imported / updated / merged / skipped / warnings) before the user
   * confirms.
   */
  async previewImport(cards: ParsedVCard[]): Promise<ImportResult> {
    const existing = await getDB().contacts.toArray();
    return buildImport(cards, existing);
  },

  /** Persist the upserts produced by a previewed import. */
  async commitImport(upserts: Contact[]): Promise<void> {
    if (upserts.length) await getDB().contacts.bulkPut(upserts);
  },

  async upsertMany(contacts: Contact[]): Promise<void> {
    await getDB().contacts.bulkPut(contacts);
  },

  async addToCategory(contactIds: string[], categoryId: string): Promise<void> {
    const db = getDB();
    await db.transaction("rw", db.contacts, async () => {
      const now = Date.now();
      for (const id of contactIds) {
        const c = await db.contacts.get(id);
        if (!c || c.categoryIds.includes(categoryId)) continue;
        await db.contacts.update(id, {
          categoryIds: [...c.categoryIds, categoryId],
          updatedAt: now,
        });
      }
    });
  },

  async removeFromCategory(
    contactIds: string[],
    categoryId: string,
  ): Promise<void> {
    const db = getDB();
    await db.transaction("rw", db.contacts, async () => {
      const now = Date.now();
      for (const id of contactIds) {
        const c = await db.contacts.get(id);
        if (!c || !c.categoryIds.includes(categoryId)) continue;
        await db.contacts.update(id, {
          categoryIds: c.categoryIds.filter((x) => x !== categoryId),
          updatedAt: now,
        });
      }
    });
  },

  async inCategory(categoryId: string): Promise<Contact[]> {
    return getDB()
      .contacts.where("categoryIds")
      .equals(categoryId)
      .sortBy("fullName");
  },

  async delete(contactIds: string[]): Promise<void> {
    await getDB().contacts.bulkDelete(contactIds);
  },
};
