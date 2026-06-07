import type { CallEntry, CallOutcome } from "@/lib/types";
import { getDB } from "@/lib/db/db";
import { campaignsRepo } from "@/features/campaigns/lib/repository";
import { eventsRepo } from "@/features/analytics/lib/repository";
import { recomputeFromHistory } from "./display";

/**
 * The call list: contacts the user intends to phone, with their latest outcome,
 * the campaigns linked for talking-point context, and an optional scheduled next
 * call. There is at most one entry per contact (keyed by the contact id).
 */
export const callsRepo = {
  async list(): Promise<CallEntry[]> {
    return getDB().calls.orderBy("updatedAt").reverse().toArray();
  },

  async get(contactId: string): Promise<CallEntry | undefined> {
    return getDB().calls.get(contactId);
  },

  /**
   * Add contacts to the call list. Existing entries are left untouched (so we
   * never reset someone's outcome/history); only genuinely new contacts get a
   * fresh entry. Returns how many were added.
   */
  async addContacts(
    contactIds: string[],
    campaignIds: string[] = [],
  ): Promise<number> {
    const db = getDB();
    let added = 0;
    await db.transaction("rw", db.calls, async () => {
      const now = Date.now();
      for (const contactId of contactIds) {
        const existing = await db.calls.get(contactId);
        if (existing) {
          // Union any newly-provided campaign links onto the existing entry.
          if (campaignIds.length) {
            const merged = new Set([...existing.campaignIds, ...campaignIds]);
            if (merged.size !== existing.campaignIds.length) {
              await db.calls.update(contactId, {
                campaignIds: [...merged],
                updatedAt: now,
              });
            }
          }
          continue;
        }
        const entry: CallEntry = {
          id: contactId,
          contactId,
          campaignIds: [...campaignIds],
          outcome: "pending",
          attempts: 0,
          history: [],
          createdAt: now,
          updatedAt: now,
        };
        await db.calls.add(entry);
        added++;
      }
    });
    return added;
  },

  /** Pull every contact in a campaign onto the call list, linking that campaign. */
  async addFromCampaign(campaignId: string): Promise<number> {
    const messages = await campaignsRepo.messagesFor(campaignId);
    const contactIds = messages.map((m) => m.contactId);
    return this.addContacts(contactIds, [campaignId]);
  },

  async remove(contactId: string): Promise<void> {
    await getDB().calls.delete(contactId);
  },

  /**
   * Record a call outcome. `called` and `no_answer` count as attempts; all
   * outcomes are appended to the history and update the entry's current state.
   */
  async setOutcome(contactId: string, outcome: CallOutcome): Promise<void> {
    const db = getDB();
    await db.transaction("rw", db.calls, async () => {
      const entry = await db.calls.get(contactId);
      if (!entry) return;
      const now = Date.now();
      const isAttempt = outcome === "called" || outcome === "no_answer";
      await db.calls.update(contactId, {
        outcome,
        attempts: entry.attempts + (isAttempt ? 1 : 0),
        lastOutcomeAt: now,
        history: [...entry.history, { at: now, outcome }],
        updatedAt: now,
      });
    });
    eventsRepo.log("call_logged", { ref: contactId, outcome });
  },

  /**
   * Correct a single past log's outcome (e.g. a mis-tapped "Called"). Rewrites
   * that history entry and recomputes the entry's current outcome/attempts/last
   * from the full history so the rolled-up state and analytics stay consistent.
   */
  async editLog(
    contactId: string,
    index: number,
    outcome: CallOutcome,
  ): Promise<void> {
    const db = getDB();
    await db.transaction("rw", db.calls, async () => {
      const entry = await db.calls.get(contactId);
      if (!entry || index < 0 || index >= entry.history.length) return;
      const history = entry.history.map((h, i) =>
        i === index ? { ...h, outcome } : h,
      );
      await db.calls.update(contactId, {
        history,
        ...recomputeFromHistory(history),
        updatedAt: Date.now(),
      });
    });
  },

  /**
   * Delete a single past log entry. Recomputes the entry's derived state from
   * what remains (resetting to `pending` when the history is emptied). The
   * caller is expected to confirm first (destructive, per the data-safety rule).
   */
  async deleteLog(contactId: string, index: number): Promise<void> {
    const db = getDB();
    await db.transaction("rw", db.calls, async () => {
      const entry = await db.calls.get(contactId);
      if (!entry || index < 0 || index >= entry.history.length) return;
      const history = entry.history.filter((_, i) => i !== index);
      await db.calls.update(contactId, {
        history,
        ...recomputeFromHistory(history),
        updatedAt: Date.now(),
      });
    });
  },

  /** Replace the set of campaigns linked to a contact for talking-point context. */
  async assignCampaigns(
    contactId: string,
    campaignIds: string[],
  ): Promise<void> {
    await getDB().calls.update(contactId, {
      campaignIds,
      updatedAt: Date.now(),
    });
  },

  async scheduleNext(
    contactId: string,
    at: number,
    note?: string,
  ): Promise<void> {
    await getDB().calls.update(contactId, {
      nextCallAt: at,
      nextCallNote: note?.trim() || undefined,
      updatedAt: Date.now(),
    });
    eventsRepo.log("call_scheduled", { ref: contactId, at });
  },

  async setNotes(contactId: string, notes: string): Promise<void> {
    await getDB().calls.update(contactId, {
      notes: notes.trim() || undefined,
      updatedAt: Date.now(),
    });
  },

  async clearNext(contactId: string): Promise<void> {
    await getDB().calls.update(contactId, {
      nextCallAt: undefined,
      nextCallNote: undefined,
      updatedAt: Date.now(),
    });
  },

  /** Scheduled calls, soonest first — powers the Upcoming agenda. */
  async upcoming(): Promise<CallEntry[]> {
    return getDB()
      .calls.where("nextCallAt")
      .above(0)
      .sortBy("nextCallAt");
  },
};
