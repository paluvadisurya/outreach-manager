import { describe, it, expect, beforeEach } from "vitest";
import { getDB, _resetDBForTests } from "@/lib/db/db";
import { parseVCF } from "@/features/contacts/lib/vcf";
import { contactsRepo } from "@/features/contacts/lib/repository";
import { categoriesRepo } from "@/features/categories/lib/repository";
import { templatesRepo } from "@/features/templates/lib/repository";
import { campaignsRepo } from "@/features/campaigns/lib/repository";
import { computeProgress } from "@/features/campaigns/lib/progress";

async function freshDb() {
  await getDB().delete();
  _resetDBForTests();
}

const MULTI_FILE_A = [
  "BEGIN:VCARD\nFN:Ramesh Kumar\nTEL:+91 98765 43210\nEND:VCARD",
  "BEGIN:VCARD\nFN:Anita Sharma\nTEL:9886077665\nEND:VCARD",
].join("\n");

const MULTI_FILE_B = [
  // Duplicate of Ramesh by phone, adds an email — must merge.
  "BEGIN:VCARD\nFN:Ramesh Kumar\nTEL:9876543210\nEMAIL:ramesh@example.com\nEND:VCARD",
  "BEGIN:VCARD\nFN:Suresh Reddy\nTEL:9900112233\nEND:VCARD",
].join("\n");

async function importVcf(text: string) {
  const cards = parseVCF(text);
  const result = await contactsRepo.previewImport(cards);
  await contactsRepo.commitImport(result.upserts);
  return result;
}

describe("end-to-end outreach workflow", () => {
  beforeEach(freshDb);

  it("imports, merges across files, persists, and survives a fresh read", async () => {
    await importVcf(MULTI_FILE_A);
    const second = await importVcf(MULTI_FILE_B);

    // Ramesh was already present and gained an email → updated, not imported.
    expect(second.summary.updated).toBe(1);

    const all = await contactsRepo.all();
    expect(all).toHaveLength(3); // Ramesh, Anita, Suresh

    const ramesh = all.find((c) => c.fullName === "Ramesh Kumar");
    expect(ramesh?.email).toBe("ramesh@example.com");

    // Persistence: reset the singleton and read again from IndexedDB.
    _resetDBForTests();
    expect(await contactsRepo.count()).toBe(3);
  });

  it("runs the full Import → Category → Template → Campaign → Queue → Resume flow", async () => {
    await importVcf(MULTI_FILE_A);
    await importVcf(MULTI_FILE_B);
    const contacts = await contactsRepo.all();

    // Create a category and add everyone to it.
    const category = await categoriesRepo.create("Villa Buyers");
    await contactsRepo.addToCategory(
      contacts.map((c) => c.id),
      category.id,
    );
    expect((await categoriesRepo.memberCounts())[category.id]).toBe(3);

    // Create a template.
    const template = await templatesRepo.create(
      "New Project Introduction",
      "Hi {{first_name}}, exploring villas in Whitefield?",
    );

    // Generate the campaign (category + template).
    const campaign = await campaignsRepo.create({
      name: "Whitefield Villa Launch",
      categoryId: category.id,
      templateId: template.id,
    });
    expect(campaign.total).toBe(3);

    let messages = await campaignsRepo.messagesFor(campaign.id);
    expect(messages).toHaveLength(3);
    expect(messages[0]!.message).toContain("Hi ");
    expect(messages[0]!.status).toBe("pending");

    // Advance the queue: send the first, skip the second, leave the third.
    await campaignsRepo.setMessageStatus(messages[0]!.id, "sent");
    await campaignsRepo.setMessageStatus(messages[1]!.id, "skipped");
    await campaignsRepo.setIndex(campaign.id, 2);

    messages = await campaignsRepo.messagesFor(campaign.id);
    const progress = computeProgress(messages);
    expect(progress.processed).toBe(2);
    expect(progress.complete).toBe(false);

    // Resume: should land on the still-pending third message.
    const resumeAt = await campaignsRepo.resumePosition(campaign.id);
    expect(resumeAt).toBe(2);

    // The resumable campaign is discoverable for the banner.
    const resumable = await campaignsRepo.resumable();
    expect(resumable?.id).toBe(campaign.id);

    // Finish it and confirm completion syncs.
    await campaignsRepo.setMessageStatus(messages[2]!.id, "sent");
    await campaignsRepo.syncCompletion(campaign.id);
    const done = await campaignsRepo.get(campaign.id);
    expect(done?.status).toBe("completed");
  });

  it("freezes campaign snapshots against later template edits", async () => {
    await importVcf("BEGIN:VCARD\nFN:Ramesh Kumar\nTEL:9876543210\nEND:VCARD");
    const contacts = await contactsRepo.all();
    const category = await categoriesRepo.create("Hot Leads");
    await contactsRepo.addToCategory([contacts[0]!.id], category.id);
    const template = await templatesRepo.create("T", "Hi {{first_name}}");

    const campaign = await campaignsRepo.create({
      name: "Frozen",
      categoryId: category.id,
      templateId: template.id,
    });
    const before = await campaignsRepo.messagesFor(campaign.id);

    // Edit the template after generation.
    await templatesRepo.update(template.id, { body: "Completely new text" });

    const after = await campaignsRepo.messagesFor(campaign.id);
    expect(after[0]!.message).toBe(before[0]!.message);
    expect(after[0]!.message).toContain("Hi Ramesh");
  });

  it("builds a campaign from an explicit contact selection", async () => {
    await importVcf(MULTI_FILE_A);
    const contacts = await contactsRepo.all();
    const template = await templatesRepo.create("T", "Hi {{first_name}}");

    const campaign = await campaignsRepo.create({
      name: "From selection",
      templateId: template.id,
      contactIds: [contacts[0]!.id],
    });
    expect(campaign.total).toBe(1);
    expect(campaign.categoryIds).toEqual([]);
    expect(campaign.contactIds).toEqual([contacts[0]!.id]);
    expect(campaign.sourceLabel).toContain("selected");
  });

  it("unions contacts across multiple source categories (de-duplicated)", async () => {
    await importVcf(MULTI_FILE_A);
    await importVcf(MULTI_FILE_B);
    const contacts = await contactsRepo.all(); // Ramesh, Anita, Suresh
    const a = await categoriesRepo.create("Group A");
    const b = await categoriesRepo.create("Group B");
    // Ramesh is in both groups; Anita only in A; Suresh only in B.
    const ramesh = contacts.find((c) => c.fullName === "Ramesh Kumar")!;
    const anita = contacts.find((c) => c.fullName === "Anita Sharma")!;
    const suresh = contacts.find((c) => c.fullName === "Suresh Reddy")!;
    await contactsRepo.addToCategory([ramesh.id, anita.id], a.id);
    await contactsRepo.addToCategory([ramesh.id, suresh.id], b.id);

    const template = await templatesRepo.create("T", "Hi {{first_name}}");
    const campaign = await campaignsRepo.create({
      name: "Both groups",
      templateIds: [template.id],
      primaryTemplateId: template.id,
      categoryIds: [a.id, b.id],
    });
    // Union of {Ramesh, Anita} ∪ {Ramesh, Suresh} = 3 distinct contacts.
    expect(campaign.total).toBe(3);
    expect(campaign.categoryIds).toEqual([a.id, b.id]);
    const messages = await campaignsRepo.messagesFor(campaign.id);
    expect(new Set(messages.map((m) => m.contactId)).size).toBe(3);
    expect(messages.every((m) => m.templateId === template.id)).toBe(true);
  });

  it("re-renders one person's message from a different template", async () => {
    await importVcf("BEGIN:VCARD\nFN:Ramesh Kumar\nTEL:9876543210\nEND:VCARD");
    const contacts = await contactsRepo.all();
    const cat = await categoriesRepo.create("Leads");
    await contactsRepo.addToCategory([contacts[0]!.id], cat.id);
    const t1 = await templatesRepo.create("Formal", "Dear {{first_name}}");
    const t2 = await templatesRepo.create("Casual", "Yo {{first_name}}!");

    const campaign = await campaignsRepo.create({
      name: "Multi-template",
      templateIds: [t1.id, t2.id],
      primaryTemplateId: t1.id,
      categoryId: cat.id,
    });
    let messages = await campaignsRepo.messagesFor(campaign.id);
    expect(messages[0]!.message).toBe("Dear Ramesh");
    expect(messages[0]!.templateId).toBe(t1.id);

    await campaignsRepo.setMessageTemplate(campaign.id, contacts[0]!.id, t2.id);
    messages = await campaignsRepo.messagesFor(campaign.id);
    expect(messages[0]!.message).toBe("Yo Ramesh!");
    expect(messages[0]!.templateId).toBe(t2.id);
  });

  it("refreshes a campaign's contacts against its source group", async () => {
    await importVcf(MULTI_FILE_A); // Ramesh, Anita
    const contacts = await contactsRepo.all();
    const ramesh = contacts.find((c) => c.fullName === "Ramesh Kumar")!;
    const anita = contacts.find((c) => c.fullName === "Anita Sharma")!;
    const cat = await categoriesRepo.create("Refresh me");
    await contactsRepo.addToCategory([ramesh.id], cat.id);
    const template = await templatesRepo.create("T", "Hi {{first_name}}");

    const campaign = await campaignsRepo.create({
      name: "Refresh",
      templateId: template.id,
      categoryId: cat.id,
    });
    expect(campaign.total).toBe(1);

    // Add Anita to the group, then refresh — she should be appended.
    await contactsRepo.addToCategory([anita.id], cat.id);
    let result = await campaignsRepo.refreshContacts(campaign.id);
    expect(result).toEqual({ added: 1, removed: 0 });
    let messages = await campaignsRepo.messagesFor(campaign.id);
    expect(messages).toHaveLength(2);
    expect(messages.map((m) => m.order)).toEqual([0, 1]);

    // Remove Ramesh from the group, then refresh — he should be dropped.
    await contactsRepo.removeFromCategory([ramesh.id], cat.id);
    result = await campaignsRepo.refreshContacts(campaign.id);
    expect(result).toEqual({ added: 0, removed: 1 });
    messages = await campaignsRepo.messagesFor(campaign.id);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.contactId).toBe(anita.id);
    expect((await campaignsRepo.get(campaign.id))!.total).toBe(1);
  });

  it("removes a deleted category from its member contacts", async () => {
    await importVcf("BEGIN:VCARD\nFN:Ramesh\nTEL:9876543210\nEND:VCARD");
    const contacts = await contactsRepo.all();
    const category = await categoriesRepo.create("Temp");
    await contactsRepo.addToCategory([contacts[0]!.id], category.id);

    await categoriesRepo.delete(category.id);
    const after = await contactsRepo.get(contacts[0]!.id);
    expect(after?.categoryIds).not.toContain(category.id);
  });
});
