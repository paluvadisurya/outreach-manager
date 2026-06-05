import Dexie, { type Table } from "dexie";
import type {
  AppSettings,
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
