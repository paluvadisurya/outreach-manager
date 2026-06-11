import { describe, it, expect, beforeEach } from "vitest";
import { getDB, _resetDBForTests } from "@/lib/db/db";
import { parseVCF } from "@/features/contacts/lib/vcf";
import { contactsRepo } from "@/features/contacts/lib/repository";
import { categoriesRepo } from "@/features/categories/lib/repository";
import { templatesRepo } from "@/features/templates/lib/repository";
import { campaignsRepo } from "@/features/campaigns/lib/repository";
import { callsRepo } from "@/features/calls/lib/repository";

async function freshDb() {
  await getDB().delete();
  _resetDBForTests();
}

// Mirrors SendingQueue.viewInCallList: take the message at the queue index,
// (maybe) add to the call list, and deep-link by that contactId.
async function callViewFor(campaignId: string, index: number) {
  const messages = await campaignsRepo.messagesFor(campaignId);
  const cur = messages[Math.min(index, messages.length - 1)]!;
  await callsRepo.addContacts([cur.contactId], [campaignId]);
  const entry = await callsRepo.get(cur.contactId);
  const contact = await contactsRepo.get(cur.contactId);
  return { shownName: cur.contactName, shownId: cur.contactId, entry, contact };
}

const FIVE = [
  "BEGIN:VCARD\nFN:Alice\nTEL:9000000001\nEND:VCARD",
  "BEGIN:VCARD\nFN:Bob\nTEL:9000000002\nEND:VCARD",
  "BEGIN:VCARD\nFN:Carol\nTEL:9000000003\nEND:VCARD",
  "BEGIN:VCARD\nFN:Dave\nTEL:9000000004\nEND:VCARD",
  "BEGIN:VCARD\nFN:Eve\nTEL:9000000005\nEND:VCARD",
].join("\n");

async function setup() {
  const cards = parseVCF(FIVE);
  const r = await contactsRepo.previewImport(cards);
  await contactsRepo.commitImport(r.upserts);
  const contacts = await contactsRepo.all();
  const cat = await categoriesRepo.create("All");
  await contactsRepo.addToCategory(contacts.map((c) => c.id), cat.id);
  const t = await templatesRepo.create("T", "Hi {{first_name}}");
  const campaign = await campaignsRepo.create({
    name: "C",
    categoryId: cat.id,
    templateId: t.id,
  });
  return { campaign, contacts };
}

// Backend regression suite for the Campaigns "Call view" → Call persona link.
// It drives the real repositories (campaigns, calls, contacts) to confirm the
// connection invariant: the contact carried by Call view (the message at the
// queue index) always resolves to that exact contact's call entry — across
// removals that renumber order and refreshes that append people. The React
// deep-link wiring is covered separately by src/lib/deep-link.test.ts.
describe("campaign Call view → correct persona (data connection)", () => {
  beforeEach(freshDb);

  it("opens the same person shown on the card (baseline)", async () => {
    const { campaign } = await setup();
    for (let i = 0; i < 5; i++) {
      const { shownName, shownId, entry, contact } = await callViewFor(
        campaign.id,
        i,
      );
      expect(entry?.contactId).toBe(shownId);
      expect(contact?.fullName).toBe(shownName);
    }
  });

  it("stays correct after a mid-list removal renumbers order", async () => {
    const { campaign } = await setup();
    let messages = await campaignsRepo.messagesFor(campaign.id);
    // Remove Carol (the 3rd person, order 2).
    const carol = messages[2]!;
    await campaignsRepo.removeMessage(campaign.id, carol.contactId);

    messages = await campaignsRepo.messagesFor(campaign.id);
    // Now position 2 should be Dave; viewing index 2 must open Dave.
    const { shownName, shownId, entry, contact } = await callViewFor(
      campaign.id,
      2,
    );
    expect(shownName).toBe("Dave");
    expect(entry?.contactId).toBe(shownId);
    expect(contact?.fullName).toBe("Dave");
  });

  it("stays correct after refresh appends new contacts", async () => {
    const { campaign, contacts } = await setup();
    // Add a 6th contact to the category and refresh.
    const extra = parseVCF("BEGIN:VCARD\nFN:Frank\nTEL:9000000006\nEND:VCARD");
    const r = await contactsRepo.previewImport(extra);
    await contactsRepo.commitImport(r.upserts);
    const frank = (await contactsRepo.all()).find((c) => c.fullName === "Frank")!;
    const cat = (await categoriesRepo.all())[0]!;
    await contactsRepo.addToCategory([frank.id], cat.id);
    await campaignsRepo.refreshContacts(campaign.id);

    const messages = await campaignsRepo.messagesFor(campaign.id);
    expect(messages).toHaveLength(6);
    const { shownName, shownId, entry } = await callViewFor(campaign.id, 5);
    expect(shownName).toBe("Frank");
    expect(entry?.contactId).toBe(shownId);
    void contacts;
  });

  it("a call entry always carries the same id as the message that opened it", async () => {
    // Whatever Call view links to, the created call entry is keyed by that exact
    // contact id — never a neighbour's. This is the core anti-"wrong person"
    // guarantee at the data layer.
    const { campaign } = await setup();
    const messages = await campaignsRepo.messagesFor(campaign.id);
    for (const m of messages) {
      await callsRepo.addContacts([m.contactId], [campaign.id]);
      const entry = await callsRepo.get(m.contactId);
      expect(entry?.id).toBe(m.contactId);
      expect(entry?.contactId).toBe(m.contactId);
      expect(entry?.campaignIds).toContain(campaign.id);
    }
  });
});
