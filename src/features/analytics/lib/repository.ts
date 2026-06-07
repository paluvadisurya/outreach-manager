import type { AppEvent, AppEventType } from "@/lib/types";
import { getDB } from "@/lib/db/db";
import { uid } from "@/lib/id";
import { startOfDay } from "./derive";

/**
 * The activity log behind the Analytics dashboard. Append-only: events are never
 * updated or deleted (except on a full restore/clear). Writing is fire-and-forget
 * — `log()` never throws and never blocks the core mutation that triggered it, so
 * analytics can fail silently without ever breaking outreach.
 */
export const eventsRepo = {
  /** Append an activity event. Best-effort; failures are swallowed. */
  log(
    type: AppEventType,
    fields: Omit<Partial<AppEvent>, "id" | "type"> = {},
  ): void {
    try {
      const at = fields.at ?? Date.now();
      const event: AppEvent = {
        id: uid(),
        type,
        at,
        day: startOfDay(at),
        ...(fields.ref ? { ref: fields.ref } : {}),
        ...(fields.campaignId ? { campaignId: fields.campaignId } : {}),
        ...(fields.templateId ? { templateId: fields.templateId } : {}),
        ...(fields.outcome ? { outcome: fields.outcome } : {}),
      };
      void getDB()
        .events.add(event)
        .catch(() => {});
    } catch {
      /* analytics must never throw into a core path */
    }
  },

  /** Append one event per id (e.g. a bulk import). Best-effort. */
  logMany(
    type: AppEventType,
    refs: string[],
    fields: Omit<Partial<AppEvent>, "id" | "type" | "ref"> = {},
  ): void {
    try {
      const at = fields.at ?? Date.now();
      const day = startOfDay(at);
      const events: AppEvent[] = refs.map((ref) => ({
        id: uid(),
        type,
        at,
        day,
        ref,
        ...(fields.campaignId ? { campaignId: fields.campaignId } : {}),
        ...(fields.templateId ? { templateId: fields.templateId } : {}),
      }));
      if (events.length) {
        void getDB()
          .events.bulkAdd(events)
          .catch(() => {});
      }
    } catch {
      /* swallow */
    }
  },

  async all(): Promise<AppEvent[]> {
    return getDB().events.orderBy("at").toArray();
  },

  /** Events within [from, to] (inclusive), oldest first. */
  async between(from: number, to: number): Promise<AppEvent[]> {
    return getDB().events.where("at").between(from, to, true, true).sortBy("at");
  },

  async byType(types: AppEventType[]): Promise<AppEvent[]> {
    return getDB().events.where("type").anyOf(types).sortBy("at");
  },

  /** The earliest event timestamp, for an "all time" range left edge. */
  async earliestAt(): Promise<number | undefined> {
    const first = await getDB().events.orderBy("at").first();
    return first?.at;
  },
};
