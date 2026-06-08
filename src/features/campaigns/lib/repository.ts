import type {
  Campaign,
  CampaignMessage,
  CampaignStatus,
  MessageStatus,
} from "@/lib/types";
import type { Contact } from "@/lib/types";
import { getDB } from "@/lib/db/db";
import { uid } from "@/lib/id";
import { contactsRepo } from "@/features/contacts/lib/repository";
import { categoriesRepo } from "@/features/categories/lib/repository";
import { templatesRepo } from "@/features/templates/lib/repository";
import { settingsRepo } from "@/features/settings/lib/repository";
import { eventsRepo } from "@/features/analytics/lib/repository";
import { renderTemplate, tidyMessage } from "@/features/templates/lib/render";
import { personalizeContact } from "@/features/contacts/lib/name";
import { generateCampaignMessages } from "./generate";
import { computeProgress, resumeIndex } from "./progress";

/**
 * A campaign draws its contacts from either one-or-more categories (a union) or an
 * explicit selection. It carries one or more templates, one of which is primary.
 *
 * Template input is flexible: pass `templateIds` + `primaryTemplateId`, or the
 * legacy single `templateId` (treated as the only/primary template). Likewise the
 * source may be `categoryIds`, the legacy single `categoryId`, or `contactIds`.
 */
export interface CampaignCreateInput {
  name: string;
  templateIds?: string[];
  primaryTemplateId?: string;
  /** Legacy single-template alias. */
  templateId?: string;
  categoryIds?: string[];
  /** Legacy single-category alias. */
  categoryId?: string;
  contactIds?: string[];
}

/** De-duplicated, order-preserving union of contacts across several categories. */
async function contactsForCategories(categoryIds: string[]): Promise<Contact[]> {
  const seen = new Set<string>();
  const union: Contact[] = [];
  for (const categoryId of categoryIds) {
    for (const contact of await contactsRepo.inCategory(categoryId)) {
      if (seen.has(contact.id)) continue;
      seen.add(contact.id);
      union.push(contact);
    }
  }
  return union;
}

/** A readable label for a campaign's contact source. */
function buildSourceLabel(categoryNames: string[], selectionCount: number): string {
  if (categoryNames.length === 0) {
    return `${selectionCount} selected contacts`;
  }
  const [first, ...rest] = categoryNames;
  return rest.length ? `${first} +${rest.length} more` : first!;
}

/** Resolve every template attached to a campaign to its body, keyed by id. */
async function templateBodyMap(campaign: Campaign): Promise<Map<string, string>> {
  const ids = [...new Set([campaign.primaryTemplateId, ...campaign.templateIds])];
  const templates = await Promise.all(ids.map((id) => templatesRepo.get(id)));
  const map = new Map<string, string>();
  templates.forEach((t) => {
    if (t) map.set(t.id, t.body);
  });
  return map;
}

export const campaignsRepo = {
  async all(): Promise<Campaign[]> {
    return getDB().campaigns.orderBy("createdAt").reverse().toArray();
  },

  async get(id: string): Promise<Campaign | undefined> {
    return getDB().campaigns.get(id);
  },

  async messagesFor(campaignId: string): Promise<CampaignMessage[]> {
    return getDB()
      .campaignMessages.where("[campaignId+order]")
      .between([campaignId, -Infinity], [campaignId, Infinity])
      .toArray();
  },

  /** Every campaign message across all campaigns — used by the Analytics view. */
  async allMessages(): Promise<CampaignMessage[]> {
    return getDB().campaignMessages.toArray();
  },

  /**
   * The set of contact ids that have at least one message marked `sent` across
   * any campaign — used by the Call list to flag who has already been messaged.
   * Uses the `status` index for an efficient scan.
   */
  async sentContactIds(): Promise<Set<string>> {
    const sent = await getDB()
      .campaignMessages.where("status")
      .equals("sent")
      .toArray();
    return new Set(sent.map((m) => m.contactId));
  },

  /**
   * The frozen, rendered message generated for a specific contact within a
   * campaign — used by the Call section to show talking points. Message ids are
   * `${campaignId}:${contactId}` (see `generate.ts`).
   */
  async messageFor(
    campaignId: string,
    contactId: string,
  ): Promise<CampaignMessage | undefined> {
    return getDB().campaignMessages.get(`${campaignId}:${contactId}`);
  },

  /**
   * Create a campaign by combining one-or-more source groups (or an explicit
   * selection) with one-or-more templates. Renders and freezes a message snapshot
   * for every contact, using the primary template.
   */
  async create(input: CampaignCreateInput): Promise<Campaign> {
    // Resolve the template set, tolerating the legacy single-template shape.
    const templateIds = (
      input.templateIds && input.templateIds.length
        ? input.templateIds
        : input.templateId
          ? [input.templateId]
          : []
    ).filter((v, i, a) => a.indexOf(v) === i);
    if (templateIds.length === 0) throw new Error("No template selected");
    const primaryTemplateId =
      input.primaryTemplateId && templateIds.includes(input.primaryTemplateId)
        ? input.primaryTemplateId
        : templateIds[0]!;
    const primary = await templatesRepo.get(primaryTemplateId);
    if (!primary) throw new Error("Template not found");

    // Resolve the contact source: a category union or an explicit selection.
    const categoryIds = (
      input.categoryIds && input.categoryIds.length
        ? input.categoryIds
        : input.categoryId
          ? [input.categoryId]
          : []
    ).filter((v, i, a) => a.indexOf(v) === i);

    let contacts: Contact[];
    let categoryNames: string[] = [];
    let contactIds: string[] = [];
    if (categoryIds.length) {
      contacts = await contactsForCategories(categoryIds);
      const cats = await Promise.all(categoryIds.map((c) => categoriesRepo.get(c)));
      categoryNames = cats.map((c, i) => c?.name ?? `Group ${i + 1}`);
    } else {
      contactIds = input.contactIds ?? [];
      const fetched = await Promise.all(contactIds.map((id) => contactsRepo.get(id)));
      contacts = fetched.filter((c): c is Contact => Boolean(c));
    }

    const settings = await settingsRepo.get();
    const now = Date.now();
    const id = uid();
    const messages = generateCampaignMessages(
      id,
      contacts,
      primary.body,
      primaryTemplateId,
      now,
      settings,
    );

    const campaign: Campaign = {
      id,
      name: input.name.trim(),
      categoryIds,
      contactIds,
      sourceLabel: buildSourceLabel(categoryNames, contacts.length),
      templateIds,
      primaryTemplateId,
      status: "active",
      currentIndex: 0,
      total: messages.length,
      createdAt: now,
      updatedAt: now,
    };

    const db = getDB();
    await db.transaction("rw", db.campaigns, db.campaignMessages, async () => {
      await db.campaigns.add(campaign);
      if (messages.length) await db.campaignMessages.bulkAdd(messages);
    });
    eventsRepo.log("campaign_created", { ref: id, campaignId: id });
    return campaign;
  },

  /**
   * Re-render every message in a campaign from the current template, contact
   * data and settings — fixing things like first-name trimming — without losing
   * the user's progress. Each message keeps its status and order; only the
   * rendered text and contact name/phone are refreshed.
   */
  async regenerate(campaignId: string): Promise<number> {
    const campaign = await this.get(campaignId);
    if (!campaign) return 0;
    const [messages, settings] = await Promise.all([
      this.messagesFor(campaignId),
      settingsRepo.get(),
    ]);

    // Resolve every template body once. Fall back to the primary when a message's
    // recorded template is missing (deleted) or empty (legacy data).
    const bodies = await templateBodyMap(campaign);
    const primaryBody = bodies.get(campaign.primaryTemplateId) ?? "";

    const now = Date.now();
    const updated: CampaignMessage[] = [];
    for (const message of messages) {
      const contact = await contactsRepo.get(message.contactId);
      if (!contact) continue;
      const templateId = bodies.has(message.templateId)
        ? message.templateId
        : campaign.primaryTemplateId;
      const body = bodies.get(templateId) ?? primaryBody;
      const personalized = personalizeContact(contact, settings);
      const { text } = renderTemplate(body, personalized);
      updated.push({
        ...message,
        contactName: contact.fullName || contact.phone,
        phone: contact.phone,
        message: tidyMessage(text),
        templateId,
        updatedAt: now,
      });
    }

    if (updated.length) await getDB().campaignMessages.bulkPut(updated);
    return updated.length;
  },

  /**
   * Re-render a single message from a chosen template (must be attached to the
   * campaign). The frozen text is replaced; status and order are kept. Used by the
   * send screen to give one person a differently-styled message.
   */
  async setMessageTemplate(
    campaignId: string,
    contactId: string,
    templateId: string,
  ): Promise<void> {
    const [campaign, template, contact, settings] = await Promise.all([
      this.get(campaignId),
      templatesRepo.get(templateId),
      contactsRepo.get(contactId),
      settingsRepo.get(),
    ]);
    if (!campaign || !template || !contact) return;
    if (!campaign.templateIds.includes(templateId)) return;
    const personalized = personalizeContact(contact, settings);
    const { text } = renderTemplate(template.body, personalized);
    await getDB().campaignMessages.update(`${campaignId}:${contactId}`, {
      message: tidyMessage(text),
      templateId,
      updatedAt: Date.now(),
    });
  },

  /** Attach another template to the campaign (no-op if already attached). */
  async addTemplate(campaignId: string, templateId: string): Promise<void> {
    const campaign = await this.get(campaignId);
    if (!campaign || campaign.templateIds.includes(templateId)) return;
    await getDB().campaigns.update(campaignId, {
      templateIds: [...campaign.templateIds, templateId],
      updatedAt: Date.now(),
    });
  },

  /** Change which attached template is the default for new/refreshed messages. */
  async setPrimaryTemplate(campaignId: string, templateId: string): Promise<void> {
    const campaign = await this.get(campaignId);
    if (!campaign || !campaign.templateIds.includes(templateId)) return;
    await getDB().campaigns.update(campaignId, {
      primaryTemplateId: templateId,
      updatedAt: Date.now(),
    });
  },

  /**
   * Reconcile a campaign's contact set with its current source (Req 5/6). Adds
   * messages for contacts now in the source but missing from the campaign, removes
   * messages for contacts no longer in the source, and refreshes the total. Frozen
   * text, status and order of surviving messages are preserved; new messages are
   * appended after the current max order and rendered from the primary template.
   */
  async refreshContacts(
    campaignId: string,
  ): Promise<{ added: number; removed: number }> {
    const campaign = await this.get(campaignId);
    if (!campaign) return { added: 0, removed: 0 };

    // The audience is the union of the category source AND any explicitly-added
    // contacts (manual adds via `addContacts`), de-duped and excluding
    // soft-removed people. Unioning both means a contact added by hand to a
    // category-based campaign isn't dropped on the next refresh.
    const fromCategories = campaign.categoryIds.length
      ? await contactsForCategories(campaign.categoryIds)
      : [];
    const fromContactIds = (
      await Promise.all(campaign.contactIds.map((id) => contactsRepo.get(id)))
    ).filter((c): c is Contact => c != null && !c.removed);
    const seen = new Set<string>();
    const desired: Contact[] = [];
    for (const c of [...fromCategories, ...fromContactIds]) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      desired.push(c);
    }
    const desiredIds = new Set(desired.map((c) => c.id));

    const existing = await this.messagesFor(campaignId);
    const existingIds = new Set(existing.map((m) => m.contactId));

    const toRemove = existing.filter((m) => !desiredIds.has(m.contactId));
    const toAdd = desired.filter((c) => !existingIds.has(c.id));

    if (toRemove.length === 0 && toAdd.length === 0) {
      return { added: 0, removed: 0 };
    }

    const settings = await settingsRepo.get();
    const primary = await templatesRepo.get(campaign.primaryTemplateId);
    const maxOrder = existing.reduce((max, m) => Math.max(max, m.order), -1);
    const now = Date.now();
    const newMessages = primary
      ? generateCampaignMessages(
          campaignId,
          toAdd,
          primary.body,
          campaign.primaryTemplateId,
          now,
          settings,
          maxOrder + 1,
        )
      : [];

    const db = getDB();
    await db.transaction("rw", db.campaigns, db.campaignMessages, async () => {
      if (toRemove.length) {
        await db.campaignMessages.bulkDelete(toRemove.map((m) => m.id));
      }
      if (newMessages.length) await db.campaignMessages.bulkAdd(newMessages);
      await db.campaigns.update(campaignId, {
        total: existing.length - toRemove.length + newMessages.length,
        updatedAt: now,
      });
    });
    return { added: newMessages.length, removed: toRemove.length };
  },

  /**
   * Manually add contacts to an existing campaign (Req: cut the friction of
   * putting someone into a campaign). They're recorded on the campaign's explicit
   * `contactIds` audience and get a message rendered from the primary template,
   * appended after the current max order. Contacts already in the campaign, plus
   * unknown or soft-removed ones, are skipped. Returns the number of messages
   * added. Recording them on `contactIds` means they survive a later
   * `refreshContacts` (which unions categories + contactIds).
   */
  async addContacts(campaignId: string, contactIds: string[]): Promise<number> {
    const campaign = await this.get(campaignId);
    if (!campaign || contactIds.length === 0) return 0;

    const existing = await this.messagesFor(campaignId);
    const existingIds = new Set(existing.map((m) => m.contactId));

    // Resolve the requested contacts once; keep only known, active ones.
    const requested = await Promise.all(
      [...new Set(contactIds)].map((id) => contactsRepo.get(id)),
    );
    const valid = requested.filter(
      (c): c is Contact => c != null && !c.removed,
    );
    const toAdd = valid.filter((c) => !existingIds.has(c.id));

    // Record every valid contact on the explicit audience, even those already
    // messaged (e.g. category-sourced), so the manual add is sticky on refresh.
    const nextContactIds = [
      ...new Set([...campaign.contactIds, ...valid.map((c) => c.id)]),
    ];

    const settings = await settingsRepo.get();
    const primary = await templatesRepo.get(campaign.primaryTemplateId);
    const maxOrder = existing.reduce((max, m) => Math.max(max, m.order), -1);
    const now = Date.now();
    const newMessages =
      primary && toAdd.length
        ? generateCampaignMessages(
            campaignId,
            toAdd,
            primary.body,
            campaign.primaryTemplateId,
            now,
            settings,
            maxOrder + 1,
          )
        : [];

    const db = getDB();
    await db.transaction("rw", db.campaigns, db.campaignMessages, async () => {
      if (newMessages.length) await db.campaignMessages.bulkAdd(newMessages);
      await db.campaigns.update(campaignId, {
        contactIds: nextContactIds,
        total: existing.length + newMessages.length,
        updatedAt: now,
      });
    });
    return newMessages.length;
  },

  /** Remove a single contact's message from the campaign and renumber the rest. */
  async removeMessage(campaignId: string, contactId: string): Promise<void> {
    const db = getDB();
    await db.transaction("rw", db.campaigns, db.campaignMessages, async () => {
      const messages = await this.messagesFor(campaignId);
      const remaining = messages.filter((m) => m.contactId !== contactId);
      if (remaining.length === messages.length) return;
      await db.campaignMessages.delete(`${campaignId}:${contactId}`);
      // Renumber so order stays a dense 0..n-1 sequence for the queue.
      const now = Date.now();
      await db.campaignMessages.bulkPut(
        remaining.map((m, i) => ({ ...m, order: i, updatedAt: now })),
      );
      await db.campaigns.update(campaignId, {
        total: remaining.length,
        updatedAt: now,
      });
    });
  },

  /** Rename a campaign. */
  async rename(campaignId: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    await getDB().campaigns.update(campaignId, {
      name: trimmed,
      updatedAt: Date.now(),
    });
  },

  /**
   * Reset a campaign back to the start: every message returns to `pending`, the
   * queue position rewinds to 0 and the campaign becomes `active` again. The
   * frozen message text is left untouched (use `regenerate` to refresh that).
   */
  async resetProgress(campaignId: string): Promise<void> {
    const db = getDB();
    const messages = await this.messagesFor(campaignId);
    const now = Date.now();
    await db.transaction("rw", db.campaigns, db.campaignMessages, async () => {
      if (messages.length) {
        await db.campaignMessages.bulkPut(
          messages.map((m) => ({ ...m, status: "pending", updatedAt: now })),
        );
      }
      await db.campaigns.update(campaignId, {
        status: "active",
        currentIndex: 0,
        updatedAt: now,
      });
    });
  },

  async setMessageStatus(
    messageId: string,
    status: MessageStatus,
  ): Promise<void> {
    await getDB().campaignMessages.update(messageId, {
      status,
      updatedAt: Date.now(),
    });
  },

  async setIndex(campaignId: string, index: number): Promise<void> {
    await getDB().campaigns.update(campaignId, {
      currentIndex: index,
      updatedAt: Date.now(),
    });
  },

  async setStatus(
    campaignId: string,
    status: CampaignStatus,
  ): Promise<void> {
    await getDB().campaigns.update(campaignId, {
      status,
      updatedAt: Date.now(),
    });
  },

  /**
   * The single active (or paused) campaign that should be offered for resume.
   * Most recently updated wins. Completed campaigns are ignored.
   */
  async resumable(): Promise<Campaign | undefined> {
    const candidates = await getDB()
      .campaigns.where("status")
      .anyOf("active", "paused")
      .sortBy("updatedAt");
    // sortBy is ascending; the most recently touched campaign is last.
    return candidates[candidates.length - 1];
  },

  /** Recompute the resume position for a campaign from its messages' statuses. */
  async resumePosition(campaignId: string): Promise<number> {
    const [campaign, messages] = await Promise.all([
      this.get(campaignId),
      this.messagesFor(campaignId),
    ]);
    if (!campaign) return 0;
    return resumeIndex(messages, campaign.currentIndex);
  },

  /** Mark a campaign complete when no message remains actionable. */
  async syncCompletion(campaignId: string): Promise<void> {
    const messages = await this.messagesFor(campaignId);
    const progress = computeProgress(messages);
    if (progress.complete) await this.setStatus(campaignId, "completed");
  },

  async delete(campaignId: string): Promise<void> {
    const db = getDB();
    await db.transaction("rw", db.campaigns, db.campaignMessages, async () => {
      await db.campaigns.delete(campaignId);
      await db.campaignMessages
        .where("campaignId")
        .equals(campaignId)
        .delete();
    });
  },
};
