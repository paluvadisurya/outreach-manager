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

describe("campaignsRepo.removeMessage exclusion on refresh", () => {
  beforeEach(freshDb);

  it("a person removed from the campaign does NOT return on refresh", async () => {
    const keep = "+919800000001";
    const drop = "+919800000002";
    await seedContact(keep, "Keep Me");
    await seedContact(drop, "Drop Me");
    const cat = await categoriesRepo.create("Buyers");
    await contactsRepo.addToCategory([keep, drop], cat.id);
    const template = await templatesRepo.create("Intro", "Hi");
    const campaign = await campaignsRepo.create({
      name: "Launch",
      templateId: template.id,
      categoryIds: [cat.id],
    });
    expect(ids(await campaignsRepo.messagesFor(campaign.id))).toEqual(
      [keep, drop].sort(),
    );

    await campaignsRepo.removeMessage(campaign.id, drop);
    const { added } = await campaignsRepo.refreshContacts(campaign.id);

    // The dropped person stays out even though they're still in the category.
    expect(added).toBe(0);
    expect(ids(await campaignsRepo.messagesFor(campaign.id))).toEqual([keep]);
    expect((await campaignsRepo.get(campaign.id))?.removedContactIds).toContain(
      drop,
    );
  });

  it("manually re-adding a removed person clears the exclusion", async () => {
    const drop = "+919800000002";
    await seedContact(drop, "Drop Me");
    const cat = await categoriesRepo.create("Buyers");
    await contactsRepo.addToCategory([drop], cat.id);
    const template = await templatesRepo.create("Intro", "Hi");
    const campaign = await campaignsRepo.create({
      name: "Launch",
      templateId: template.id,
      categoryIds: [cat.id],
    });

    await campaignsRepo.removeMessage(campaign.id, drop);
    await campaignsRepo.addContacts(campaign.id, [drop]);

    expect(ids(await campaignsRepo.messagesFor(campaign.id))).toEqual([drop]);
    expect(
      (await campaignsRepo.get(campaign.id))?.removedContactIds ?? [],
    ).not.toContain(drop);
    // And a later refresh keeps them (no longer excluded).
    await campaignsRepo.refreshContacts(campaign.id);
    expect(ids(await campaignsRepo.messagesFor(campaign.id))).toEqual([drop]);
  });
});

describe("campaignsRepo template management (gear)", () => {
  beforeEach(freshDb);

  async function campaignWithThreeTemplates() {
    const a = "+919800000001";
    await seedContact(a, "Asha One");
    const t1 = await templatesRepo.create("One", "Hi 1");
    const t2 = await templatesRepo.create("Two", "Hi 2");
    const t3 = await templatesRepo.create("Three", "Hi 3");
    const campaign = await campaignsRepo.create({
      name: "Launch",
      templateId: t1.id,
      contactIds: [a],
    });
    await campaignsRepo.addTemplate(campaign.id, t2.id);
    await campaignsRepo.addTemplate(campaign.id, t3.id);
    return { campaignId: campaign.id, t1, t2, t3 };
  }

  it("setTemplateOrder reorders the attached templates", async () => {
    const { campaignId, t1, t2, t3 } = await campaignWithThreeTemplates();
    await campaignsRepo.setTemplateOrder(campaignId, [t3.id, t1.id, t2.id]);
    expect((await campaignsRepo.get(campaignId))?.templateIds).toEqual([
      t3.id,
      t1.id,
      t2.id,
    ]);
  });

  it("removeTemplate detaches and promotes a new primary when needed", async () => {
    const { campaignId, t1, t2, t3 } = await campaignWithThreeTemplates();
    // t1 is primary; removing it promotes the next remaining one.
    await campaignsRepo.removeTemplate(campaignId, t1.id);
    const after = await campaignsRepo.get(campaignId);
    expect(after?.templateIds).toEqual([t2.id, t3.id]);
    expect(after?.primaryTemplateId).toBe(t2.id);
  });

  it("removeTemplate never removes the last template", async () => {
    const { campaignId, t1, t2, t3 } = await campaignWithThreeTemplates();
    await campaignsRepo.removeTemplate(campaignId, t2.id);
    await campaignsRepo.removeTemplate(campaignId, t3.id);
    // Only t1 remains; a further removal is a no-op.
    await campaignsRepo.removeTemplate(campaignId, t1.id);
    expect((await campaignsRepo.get(campaignId))?.templateIds).toEqual([t1.id]);
  });
});
