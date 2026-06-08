import { describe, it, expect, beforeEach } from "vitest";
import { getDB, _resetDBForTests } from "@/lib/db/db";
import { contactsRepo } from "@/features/contacts/lib/repository";
import {
  categoriesRepo,
  RATING_CATEGORY,
} from "@/features/categories/lib/repository";
import { callsRepo } from "./repository";

async function freshDb() {
  await getDB().delete();
  _resetDBForTests();
}

/** Seed one contact that already sits on the call list. */
async function seedCallContact(id = "+919876543210") {
  await contactsRepo.upsertMany([
    {
      id,
      phone: id,
      rawPhone: id,
      firstName: "Ramesh",
      lastName: "Kumar",
      fullName: "Ramesh Kumar",
      categoryIds: [],
      searchIndex: "ramesh kumar",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ]);
  await callsRepo.addContacts([id]);
  return id;
}

async function membersOf(rating: keyof typeof RATING_CATEGORY) {
  const category = await categoriesRepo.getRatingCategory(rating);
  if (!category) return [];
  return contactsRepo.inCategory(category.id);
}

describe("callsRepo.setRating + managed rating categories", () => {
  beforeEach(freshDb);

  it("persists the rating on the call entry", async () => {
    const id = await seedCallContact();
    await callsRepo.setRating(id, "connect");
    expect((await callsRepo.get(id))?.rating).toBe("connect");
  });

  it("adds the contact to the chosen colour category, creating it on first use", async () => {
    const id = await seedCallContact();
    // No managed categories exist until a rating is set.
    expect(await categoriesRepo.getRatingCategory("connect")).toBeUndefined();

    await callsRepo.setRating(id, "connect");

    const connect = await categoriesRepo.getRatingCategory("connect");
    expect(connect?.name).toBe(RATING_CATEGORY.connect.name);
    expect(connect?.color).toBe(RATING_CATEGORY.connect.color);
    expect((await membersOf("connect")).map((c) => c.id)).toEqual([id]);
  });

  it("moves membership when the rating changes, leaving no stragglers", async () => {
    const id = await seedCallContact();
    await callsRepo.setRating(id, "connect");
    await callsRepo.setRating(id, "avoid");

    expect((await membersOf("connect")).map((c) => c.id)).toEqual([]);
    expect((await membersOf("avoid")).map((c) => c.id)).toEqual([id]);
    expect((await callsRepo.get(id))?.rating).toBe("avoid");
  });

  it("does not eagerly create the unused colour categories", async () => {
    const id = await seedCallContact();
    await callsRepo.setRating(id, "connect");
    // Only the selected colour's category should exist.
    expect(await categoriesRepo.getRatingCategory("no_answer")).toBeUndefined();
    expect(await categoriesRepo.getRatingCategory("avoid")).toBeUndefined();
  });

  it("clears the rating and removes the contact from every colour category", async () => {
    const id = await seedCallContact();
    await callsRepo.setRating(id, "no_answer");
    await callsRepo.setRating(id, null);

    expect((await callsRepo.get(id))?.rating).toBeUndefined();
    expect((await membersOf("no_answer")).map((c) => c.id)).toEqual([]);
  });

  it("untags the rating category when the contact is soft-removed", async () => {
    const id = await seedCallContact();
    await callsRepo.setRating(id, "avoid");
    const avoidCat = await categoriesRepo.getRatingCategory("avoid");
    expect(avoidCat).toBeDefined();

    await contactsRepo.remove([id]);

    // The call entry (where the rating lives) is gone…
    expect(await callsRepo.get(id)).toBeUndefined();
    // …and the colour-category tag is stripped from the contact record itself,
    // so a restore doesn't resurrect a phantom rating.
    const contact = await contactsRepo.get(id);
    expect(contact?.removed).toBe(true);
    expect(contact?.categoryIds).not.toContain(avoidCat!.id);
  });
});
