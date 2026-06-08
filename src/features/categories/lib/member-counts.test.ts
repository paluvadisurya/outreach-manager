import { describe, it, expect, beforeEach } from "vitest";
import { getDB, _resetDBForTests } from "@/lib/db/db";
import { contactsRepo } from "@/features/contacts/lib/repository";
import { categoriesRepo } from "./repository";

async function freshDb() {
  await getDB().delete();
  _resetDBForTests();
}

async function seedContact(id: string, name: string) {
  await contactsRepo.upsertMany([
    {
      id,
      phone: id,
      rawPhone: id,
      firstName: name.split(" ")[0]!,
      lastName: name.split(" ")[1] ?? "",
      fullName: name,
      categoryIds: [],
      searchIndex: name.toLowerCase(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ]);
}

describe("categoriesRepo.memberCounts excludes soft-removed contacts", () => {
  beforeEach(freshDb);

  it("counts only active members, but keeps membership for restore", async () => {
    const a = "+919800000001";
    const b = "+919800000002";
    await seedContact(a, "Active One");
    await seedContact(b, "Removed Two");
    const cat = await categoriesRepo.create("Buyers");
    await contactsRepo.addToCategory([a, b], cat.id);

    expect((await categoriesRepo.memberCounts())[cat.id]).toBe(2);

    await contactsRepo.remove([b]);
    // Removed contact no longer inflates the live count…
    expect((await categoriesRepo.memberCounts())[cat.id]).toBe(1);

    // …but the membership survives, so a restore brings the count back.
    await contactsRepo.restore([b]);
    expect((await categoriesRepo.memberCounts())[cat.id]).toBe(2);
  });
});
