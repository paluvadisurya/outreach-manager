import type {
  AppSettings,
  CampaignMessage,
  Contact,
  MessageStatus,
} from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { renderTemplate, tidyMessage } from "@/features/templates/lib/render";
import { personalizeContact } from "@/features/contacts/lib/name";

/**
 * Generate frozen message snapshots for a campaign. The rendered text is
 * captured here and stored verbatim, so subsequent edits to the source template
 * can never alter an already-generated campaign.
 *
 * First-name trimming is applied here (not at import) using the current
 * settings, so personalization reflects the latest preferences at the moment a
 * campaign is generated.
 */
export function generateCampaignMessages(
  campaignId: string,
  contacts: Contact[],
  templateBody: string,
  templateId: string,
  now: number = Date.now(),
  settings: AppSettings = DEFAULT_SETTINGS,
  startOrder: number = 0,
): CampaignMessage[] {
  return contacts.map((contact, index) => {
    const personalized = personalizeContact(contact, settings);
    const { text } = renderTemplate(templateBody, personalized);
    return {
      id: `${campaignId}:${contact.id}`,
      campaignId,
      contactId: contact.id,
      contactName: contact.fullName || contact.phone,
      phone: contact.phone,
      message: tidyMessage(text),
      templateId,
      status: "pending" as MessageStatus,
      order: startOrder + index,
      updatedAt: now,
    };
  });
}
