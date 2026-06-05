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
    expect(campaign.categoryId).toBe("");
    expect(campaign.sourceLabel).toContain("selected");
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
