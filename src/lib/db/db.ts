import Dexie, { type Table } from "dexie";
import type {
  AppEvent,
  AppSettings,
  CallEntry,
  Campaign,
  CampaignMessage,
  Category,
  Contact,
  Template,
} from "@/lib/types";

/** Persisted settings row. A single record keyed by SETTINGS_KEY is used. */
export interface SettingsRecord extends AppSettings {
  id: string;
}

export const SETTINGS_KEY = "app";

/**
 * The single IndexedDB database backing the whole application. All persistence
 * flows through here — there is no server. Everything survives refresh, restart
 * and device reboot because it lives in the browser's durable storage.
 */
export class OutreachDB extends Dexie {
  contacts!: Table<Contact, string>;
  categories!: Table<Category, string>;
  templates!: Table<Template, string>;
  campaigns!: Table<Campaign, string>;
  campaignMessages!: Table<CampaignMessage, string>;
  settings!: Table<SettingsRecord, string>;
  calls!: Table<CallEntry, string>;
  events!: Table<AppEvent, string>;

  constructor() {
    super("outreach-manager");
    this.version(1).stores({
      // `*categoryIds` is a multi-entry index for fast category membership
      // queries. `searchIndex` is intentionally not indexed — search runs in
      // memory for substring flexibility.
      contacts: "id, fullName, *categoryIds, updatedAt, createdAt",
      categories: "id, name, createdAt",
      templates: "id, name, updatedAt",
      campaigns: "id, status, updatedAt, createdAt",
      campaignMessages: "id, campaignId, status, [campaignId+order]",
    });
    this.version(2).stores({
      settings: "id",
    });
    this.version(3).stores({
      // Call list. Keyed by contactId (one entry per contact). `nextCallAt` is
      // indexed so the Upcoming agenda can range-scan scheduled calls.
      calls: "id, outcome, nextCallAt, updatedAt",
    });
    this.version(4).stores({
      // `updatedAt` is indexed so the backup signature can range-scan for the
      // newest mutation (computeSignature orders campaignMessages by updatedAt).
      campaignMessages: "id, campaignId, status, updatedAt, [campaignId+order]",
    });
    // v5 — campaigns gained multiple templates + multiple source categories, and
    // each message records which template rendered it. No index changes; just
    // backfill the new array fields from the old singular ones so existing data
    // keeps working.
    this.version(5).upgrade(async (tx) => {
      const campaigns = tx.table<Campaign, string>("campaigns");
      const messages = tx.table<CampaignMessage, string>("campaignMessages");
      const templateByCampaign = new Map<string, string>();
      await campaigns.toCollection().modify((c) => {
        const templateId = c.templateId ?? c.primaryTemplateId ?? "";
        if (templateId) templateByCampaign.set(c.id, templateId);
        if (!c.templateIds) c.templateIds = templateId ? [templateId] : [];
        if (!c.primaryTemplateId) c.primaryTemplateId = templateId;
        if (!c.categoryIds)
          c.categoryIds = c.categoryId ? [c.categoryId] : [];
        if (!c.contactIds) c.contactIds = [];
      });
      await messages.toCollection().modify((m) => {
        if (!m.templateId)
          m.templateId = templateByCampaign.get(m.campaignId) ?? "";
      });
    });
    // v6 — purely additive: a lightweight append-only activity log powering the
    // Analytics dashboard. No existing store changes and no data migration, so
    // existing installs upgrade transparently. `day` (local-midnight epoch) is
    // indexed for fast daily grouping; `[type+at]` supports filtered time scans.
    this.version(6).stores({
      events: "id, type, at, day, [type+at]",
    });
  }
}

/**
 * Lazily-created singleton. Guarded so it is only instantiated in the browser;
 * importing this module during SSR or in a non-DOM context will not open a
 * connection until `getDB()` is called.
 */
let _db: OutreachDB | null = null;

export function getDB(): OutreachDB {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is not available in this environment.");
  }
  if (!_db) {
    _db = new OutreachDB();
    // Open eagerly so connection/permission failures surface in the console
    // (e.g. Safari private mode) instead of silently hanging a query.
    _db.open().catch((err) => console.error("IndexedDB open failed:", err));
  }
  return _db;
}

/** Test helper: reset the singleton between test cases. */
export function _resetDBForTests(): void {
  _db = null;
}
