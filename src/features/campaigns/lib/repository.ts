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
import { renderTemplate, tidyMessage } from "@/features/templates/lib/render";
import { personalizeContact } from "@/features/contacts/lib/name";
import { generateCampaignMessages } from "./generate";
import { computeProgress, resumeIndex } from "./progress";

/**
 * A campaign draws its contacts from either a category or an explicit selection.
 * Exactly one source should be provided.
 */
export interface CampaignCreateInput {
  name: string;
  templateId: string;
  categoryId?: string;
  contactIds?: string[];
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

  /**
   * Create a campaign by combining a category and a template. Renders and freezes
   * a message snapshot for every contact in the category.
   */
  async create(input: CampaignCreateInput): Promise<Campaign> {
    const template = await templatesRepo.get(input.templateId);
    if (!template) throw new Error("Template not found");

    let contacts: Contact[];
    let sourceLabel: string;
    if (input.categoryId) {
      contacts = await contactsRepo.inCategory(input.categoryId);
      const category = await categoriesRepo.get(input.categoryId);
      sourceLabel = category?.name ?? "Category";
    } else {
      const ids = input.contactIds ?? [];
      const fetched = await Promise.all(ids.map((id) => contactsRepo.get(id)));
      contacts = fetched.filter((c): c is Contact => Boolean(c));
      sourceLabel = `${contacts.length} selected contacts`;
    }

    const settings = await settingsRepo.get();
    const now = Date.now();
    const id = uid();
    const messages = generateCampaignMessages(
      id,
      contacts,
      template.body,
      now,
      settings,
    );

    const campaign: Campaign = {
      id,
      name: input.name.trim(),
      categoryId: input.categoryId ?? "",
      sourceLabel,
      templateId: input.templateId,
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
    const [template, messages, settings] = await Promise.all([
      templatesRepo.get(campaign.templateId),
      this.messagesFor(campaignId),
      settingsRepo.get(),
    ]);
    if (!template) return 0;

    const now = Date.now();
    const updated: CampaignMessage[] = [];
    for (const message of messages) {
      const contact = await contactsRepo.get(message.contactId);
      if (!contact) continue;
      const personalized = personalizeContact(contact, settings);
      const { text } = renderTemplate(template.body, personalized);
      updated.push({
        ...message,
        contactName: contact.fullName || contact.phone,
        phone: contact.phone,
        message: tidyMessage(text),
        updatedAt: now,
      });
    }

    if (updated.length) await getDB().campaignMessages.bulkPut(updated);
    return updated.length;
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
