import type { Category, Contact, ContactRating, ParsedVCard } from "@/lib/types";
import { getDB } from "@/lib/db/db";
import { eventsRepo } from "@/features/analytics/lib/repository";
import {
  categoriesRepo,
  RATING_CATEGORY,
} from "@/features/categories/lib/repository";
import { buildImport, type ImportResult } from "./import";

export const contactsRepo = {
  /** Active contacts only — soft-removed ones are excluded everywhere. */
  async all(): Promise<Contact[]> {
    const rows = await getDB().contacts.orderBy("fullName").toArray();
    return rows.filter((c) => !c.removed);
  },

  /** Soft-removed contacts, newest first — powers Settings → Removed contacts. */
  async removedList(): Promise<Contact[]> {
    const rows = await getDB().contacts.filter((c) => Boolean(c.removed)).toArray();
    return rows.sort((a, b) => (b.removedAt ?? 0) - (a.removedAt ?? 0));
  },

  async get(id: string): Promise<Contact | undefined> {
    return getDB().contacts.get(id);
  },

  async count(): Promise<number> {
    const rows = await getDB().contacts.toArray();
    return rows.reduce((n, c) => n + (c.removed ? 0 : 1), 0);
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
    const rows = await getDB()
      .contacts.where("categoryIds")
      .equals(categoryId)
      .sortBy("fullName");
    return rows.filter((c) => !c.removed);
  },

  /**
   * Soft-remove contacts (no WhatsApp / out of domain). They disappear from every
   * active list, group and campaign source, and re-imports skip them — but the
   * record survives so the removal can be undone. Also clears their call-list
   * entry, and untags them from the managed 🟢/🟡/🔴 rating categories: the
   * rating lives on the (now-deleted) call entry, so leaving the colour tag would
   * be a phantom rating that reappears on restore with nothing behind it.
   * Reversible via `restore` (their other category memberships return).
   */
  async remove(contactIds: string[]): Promise<void> {
    const db = getDB();
    // Resolve the managed rating categories up front (a separate read) so the
    // write transaction can strip them from each contact's memberships.
    const ratingCategoryIds = new Set(
      (
        await Promise.all(
          (Object.keys(RATING_CATEGORY) as ContactRating[]).map((r) =>
            categoriesRepo.getRatingCategory(r),
          ),
        )
      )
        .filter((c): c is Category => Boolean(c))
        .map((c) => c.id),
    );
    const actuallyRemoved: string[] = [];
    await db.transaction("rw", db.contacts, db.calls, async () => {
      const now = Date.now();
      for (const id of contactIds) {
        const c = await db.contacts.get(id);
        if (!c || c.removed) continue;
        await db.contacts.update(id, {
          removed: true,
          removedAt: now,
          updatedAt: now,
          categoryIds: c.categoryIds.filter(
            (cid) => !ratingCategoryIds.has(cid),
          ),
        });
        await db.calls.delete(id);
        actuallyRemoved.push(id);
      }
    });
    if (actuallyRemoved.length) {
      eventsRepo.logMany("contact_removed", actuallyRemoved);
    }
  },

  /** Restore soft-removed contacts back into the active lists. */
  async restore(contactIds: string[]): Promise<void> {
    const db = getDB();
    await db.transaction("rw", db.contacts, async () => {
      const now = Date.now();
      for (const id of contactIds) {
        const c = await db.contacts.get(id);
        if (!c || !c.removed) continue;
        await db.contacts.update(id, {
          removed: false,
          removedAt: undefined,
          updatedAt: now,
        });
      }
    });
  },

  /**
   * Permanently delete contacts from the database (no undo). Purges everything
   * keyed to them in the same transaction — the contact record, their call-list
   * entry, and any campaign messages — so nothing is left orphaned. Their
   * category memberships vanish with the contact record.
   */
  async delete(contactIds: string[]): Promise<void> {
    if (contactIds.length === 0) return;
    const ids = new Set(contactIds);
    const db = getDB();
    await db.transaction(
      "rw",
      db.contacts,
      db.calls,
      db.campaignMessages,
      async () => {
        await db.contacts.bulkDelete(contactIds);
        await db.calls.bulkDelete(contactIds);
        await db.campaignMessages
          .filter((m) => ids.has(m.contactId))
          .delete();
      },
    );
  },
};
