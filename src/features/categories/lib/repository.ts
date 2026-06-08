import type { Category, ContactRating } from "@/lib/types";
import { getDB } from "@/lib/db/db";
import { uid } from "@/lib/id";

/**
 * The managed "keep" group used by the contact-cleanup triage flow. A normal
 * category (so it shows up in People and can power campaigns), just with a
 * reserved name so the triage tool can find-or-create it deterministically.
 */
export const SHORTLIST_NAME = "⭐ Shortlist";

/**
 * Managed categories mirroring the call-list traffic-light rating. Like the
 * Shortlist, these are normal categories with reserved names + fixed colours, so
 * a person's disposition shows up in People and can power campaigns/bulk tools.
 * Membership is kept in sync from a single place — `callsRepo.setRating`.
 */
export const RATING_CATEGORY: Record<
  ContactRating,
  { name: string; color: string }
> = {
  connect: { name: "🟢 Connect again", color: "#16a34a" },
  no_answer: { name: "🟡 Didn't pick", color: "#ca8a04" },
  avoid: { name: "🔴 Don't call again", color: "#dc2626" },
};

const PALETTE = [
  "#16a34a",
  "#2563eb",
  "#9333ea",
  "#db2777",
  "#ea580c",
  "#0891b2",
  "#ca8a04",
  "#4f46e5",
];

export const categoriesRepo = {
  async all(): Promise<Category[]> {
    return getDB().categories.orderBy("name").toArray();
  },

  async get(id: string): Promise<Category | undefined> {
    return getDB().categories.get(id);
  },

  /** The managed Shortlist group, if it exists yet. */
  async getShortlist(): Promise<Category | undefined> {
    return getDB().categories.where("name").equals(SHORTLIST_NAME).first();
  },

  /** Find the managed Shortlist group, creating it on first use. */
  async findOrCreateShortlist(): Promise<Category> {
    const existing = await this.getShortlist();
    if (existing) return existing;
    return this.create(SHORTLIST_NAME);
  },

  /** The managed rating-colour group for a disposition, if it exists yet. */
  async getRatingCategory(
    rating: ContactRating,
  ): Promise<Category | undefined> {
    return getDB()
      .categories.where("name")
      .equals(RATING_CATEGORY[rating].name)
      .first();
  },

  /** Find the managed rating-colour group, creating it on first use. */
  async findOrCreateRatingCategory(
    rating: ContactRating,
  ): Promise<Category> {
    const existing = await this.getRatingCategory(rating);
    if (existing) return existing;
    const { name, color } = RATING_CATEGORY[rating];
    return this.create(name, color);
  },

  async create(name: string, color?: string): Promise<Category> {
    const trimmed = name.trim();
    const existingCount = await getDB().categories.count();
    const category: Category = {
      id: uid(),
      name: trimmed,
      color: color ?? PALETTE[existingCount % PALETTE.length],
      createdAt: Date.now(),
    };
    await getDB().categories.add(category);
    return category;
  },

  async rename(id: string, name: string): Promise<void> {
    await getDB().categories.update(id, { name: name.trim() });
  },

  /** Delete a category and strip it from every contact that referenced it. */
  async delete(id: string): Promise<void> {
    const db = getDB();
    await db.transaction("rw", db.categories, db.contacts, async () => {
      await db.categories.delete(id);
      const members = await db.contacts
        .where("categoryIds")
        .equals(id)
        .toArray();
      const now = Date.now();
      for (const c of members) {
        await db.contacts.update(c.id, {
          categoryIds: c.categoryIds.filter((x) => x !== id),
          updatedAt: now,
        });
      }
    });
  },

  /**
   * Map of categoryId -> number of *active* contacts, for display in the
   * category list. Soft-removed contacts keep their memberships (so a restore
   * brings them back) but must not inflate the live count.
   */
  async memberCounts(): Promise<Record<string, number>> {
    const db = getDB();
    const counts: Record<string, number> = {};
    await db.contacts.each((c) => {
      if (c.removed) return;
      for (const id of c.categoryIds) {
        counts[id] = (counts[id] ?? 0) + 1;
      }
    });
    return counts;
  },
};
