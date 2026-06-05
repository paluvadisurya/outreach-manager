import type { Category } from "@/lib/types";
import { getDB } from "@/lib/db/db";
import { uid } from "@/lib/id";

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

  async create(name: string): Promise<Category> {
    const trimmed = name.trim();
    const existingCount = await getDB().categories.count();
    const category: Category = {
      id: uid(),
      name: trimmed,
      color: PALETTE[existingCount % PALETTE.length],
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

  /** Map of categoryId -> number of contacts, for display in the category list. */
  async memberCounts(): Promise<Record<string, number>> {
    const db = getDB();
    const counts: Record<string, number> = {};
    await db.contacts.each((c) => {
      for (const id of c.categoryIds) {
        counts[id] = (counts[id] ?? 0) + 1;
      }
    });
    return counts;
  },
};
