import { describe, it, expect, beforeEach } from "vitest";
import { getDB, _resetDBForTests } from "@/lib/db/db";
import { contactsRepo } from "@/features/contacts/lib/repository";
import { categoriesRepo } from "@/features/categories/lib/repository";
import { templatesRepo } from "@/features/templates/lib/repository";
import { campaignsRepo } from "./repository";

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

const ids = (msgs: { contactId: string }[]) =>
  msgs.map((m) => m.contactId).sort();

describe("campaignsRepo.addContacts", () => {
  beforeEach(freshDb);

  it("adds a message for new contacts and bumps the total", async () => {
    const a = "+919800000001";
    const b = "+919800000002";
    await seedContact(a, "Asha One");
    await seedContact(b, "Bala Two");
    const template = await templatesRepo.create("Intro", "Hi {{first_name}}");
    const campaign = await campaignsRepo.create({
      name: "Launch",
      templateId: template.id,
      contactIds: [a],
    });
    expect((await campaignsRepo.messagesFor(campaign.id)).length).toBe(1);

    const added = await campaignsRepo.addContacts(campaign.id, [b]);
    expect(added).toBe(1);
    expect(ids(await campaignsRepo.messagesFor(campaign.id))).toEqual([a, b].sort());
    expect((await campaignsRepo.get(campaign.id))?.total).toBe(2);
  });

  it("is idempotent for contacts already in the campaign", async () => {
    const a = "+919800000001";
    await seedContact(a, "Asha One");
    const template = await templatesRepo.create("Intro", "Hi");
    const campaign = await campaignsRepo.create({
      name: "Launch",
      templateId: template.id,
      contactIds: [a],
    });

    const added = await campaignsRepo.addContacts(campaign.id, [a]);
    expect(added).toBe(0);
    expect((await campaignsRepo.messagesFor(campaign.id)).length).toBe(1);
  });

  it("skips unknown and soft-removed contacts", async () => {
    const a = "+919800000001";
    const gone = "+919800000009";
    await seedContact(a, "Asha One");
    await seedContact(gone, "Gone Person");
    await contactsRepo.remove([gone]);
    const template = await templatesRepo.create("Intro", "Hi");
    const campaign = await campaignsRepo.create({
      name: "Launch",
      templateId: template.id,
      contactIds: [a],
    });

    const added = await campaignsRepo.addContacts(campaign.id, [
      gone,
      "+910000000000",
    ]);
    expect(added).toBe(0);
    expect((await campaignsRepo.messagesFor(campaign.id)).length).toBe(1);
  });

  it("manual adds survive a refresh on a category-based campaign", async () => {
    const inCat = "+919800000001";
    const manual = "+919800000002";
    await seedContact(inCat, "Cat Member");
    await seedContact(manual, "Manual Add");
    const cat = await categoriesRepo.create("Buyers");
    await contactsRepo.addToCategory([inCat], cat.id);
    const template = await templatesRepo.create("Intro", "Hi");
    const campaign = await campaignsRepo.create({
      name: "Launch",
      templateId: template.id,
      categoryIds: [cat.id],
    });
    expect(ids(await campaignsRepo.messagesFor(campaign.id))).toEqual([inCat]);

    await campaignsRepo.addContacts(campaign.id, [manual]);
    const { removed } = await campaignsRepo.refreshContacts(campaign.id);

    expect(removed).toBe(0);
    expect(ids(await campaignsRepo.messagesFor(campaign.id))).toEqual(
      [inCat, manual].sort(),
    );
  });
});
