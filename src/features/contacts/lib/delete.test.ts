import { describe, it, expect, beforeEach } from "vitest";
import { getDB, _resetDBForTests } from "@/lib/db/db";
import { contactsRepo } from "./repository";
import { callsRepo } from "@/features/calls/lib/repository";
import { templatesRepo } from "@/features/templates/lib/repository";
import { campaignsRepo } from "@/features/campaigns/lib/repository";

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

describe("contactsRepo.delete purges everything keyed to the contact", () => {
  beforeEach(freshDb);

  it("erases the contact, their call entry, and their campaign messages", async () => {
    const keep = "+919876543210";
    const drop = "+919886077665";
    await seedContact(keep, "Ramesh Kumar");
    await seedContact(drop, "Anita Sharma");

    // Both land on the call list and in a campaign.
    await callsRepo.addContacts([keep, drop]);
    const template = await templatesRepo.create("Intro", "Hi {{first_name}}");
    const campaign = await campaignsRepo.create({
      name: "Launch",
      templateId: template.id,
      contactIds: [keep, drop],
    });

    expect((await campaignsRepo.messagesFor(campaign.id)).length).toBe(2);

    await contactsRepo.delete([drop]);

    // Dropped contact is gone everywhere; the kept one is untouched.
    expect(await contactsRepo.get(drop)).toBeUndefined();
    expect(await callsRepo.get(drop)).toBeUndefined();
    expect(await contactsRepo.get(keep)).toBeDefined();
    expect(await callsRepo.get(keep)).toBeDefined();

    const messages = await campaignsRepo.messagesFor(campaign.id);
    expect(messages.map((m) => m.contactId)).toEqual([keep]);
  });
});
