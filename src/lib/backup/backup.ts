import { type Table } from "dexie";
import { getDB, type SettingsRecord } from "@/lib/db/db";
import type {
  Campaign,
  CampaignMessage,
  Category,
  Contact,
  Template,
} from "@/lib/types";
import { buildSearchIndex } from "@/features/contacts/lib/merge";

/**
 * Full-state backup & restore.
 *
 * The entire application lives in the browser (IndexedDB) with no server, so the
 * only way to move data between devices — or to keep it safe — is to export it
 * to a file and import it back. A backup is a single self-describing JSON file
 * containing every table verbatim, including the IDs, so a restore can faithfully
 * rebuild the app (contacts, their groups, templates, and in-progress campaigns).
 */

export const BACKUP_APP = "outreach-manager" as const;
export const BACKUP_VERSION = 1 as const;

export interface BackupData {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: number;
  contacts: Contact[];
  categories: Category[];
  templates: Template[];
  campaigns: Campaign[];
  campaignMessages: CampaignMessage[];
  settings: SettingsRecord[];
}

export interface BackupCounts {
  contacts: number;
  categories: number;
  templates: number;
  campaigns: number;
  messages: number;
}

export type RestoreMode = "merge" | "replace";

export interface RestoreSummary {
  mode: RestoreMode;
  contactsAdded: number;
  contactsUpdated: number;
  categoriesAdded: number;
  templatesAdded: number;
  campaignsAdded: number;
  messagesAdded: number;
}

/** Read every table into a plain, serializable snapshot of the whole app. */
export async function exportBackup(): Promise<BackupData> {
  const db = getDB();
  const [contacts, categories, templates, campaigns, campaignMessages, settings] =
    await Promise.all([
      db.contacts.toArray(),
      db.categories.toArray(),
      db.templates.toArray(),
      db.campaigns.toArray(),
      db.campaignMessages.toArray(),
      db.settings.toArray(),
    ]);

  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    contacts,
    categories,
    templates,
    campaigns,
    campaignMessages,
    settings,
  };
}

export function countsOf(data: BackupData): BackupCounts {
  return {
    contacts: data.contacts.length,
    categories: data.categories.length,
    templates: data.templates.length,
    campaigns: data.campaigns.length,
    messages: data.campaignMessages.length,
  };
}

/** A timestamped, filesystem-safe filename for the downloaded backup. */
export function backupFilename(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `outreach-backup-${stamp}.json`;
}

/**
 * Export the whole app and trigger a file download. On mobile this lands in the
 * browser's Downloads (or the share sheet on iOS), from where the user can save
 * it into any folder / cloud drive.
 */
export async function downloadBackup(): Promise<BackupCounts> {
  const data = await exportBackup();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = backupFilename();
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 2000);

  return countsOf(data);
}

/** Parse and lightly validate a backup file's text. Throws on anything wrong. */
export function parseBackup(text: string): BackupData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("This file isn't valid JSON.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("This file isn't a recognizable backup.");
  }
  const data = parsed as Partial<BackupData>;
  if (data.app !== BACKUP_APP) {
    throw new Error("This doesn't look like an Outreach backup file.");
  }

  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    app: BACKUP_APP,
    version: typeof data.version === "number" ? data.version : 1,
    exportedAt: typeof data.exportedAt === "number" ? data.exportedAt : Date.now(),
    contacts: arr<Contact>(data.contacts),
    categories: arr<Category>(data.categories),
    templates: arr<Template>(data.templates),
    campaigns: arr<Campaign>(data.campaigns),
    campaignMessages: arr<CampaignMessage>(data.campaignMessages),
    settings: arr<SettingsRecord>(data.settings),
  };
}

/**
 * Merge an incoming contact onto an existing one: never lose data. Existing
 * non-empty fields win; empty fields are filled from the incoming record; and —
 * crucially — category memberships (groups) are unioned so re-importing never
 * strips a contact out of the groups the user built.
 */
function mergeContactRecords(existing: Contact, incoming: Contact): Contact {
  const merged: Contact = { ...existing };

  if (!merged.email && incoming.email) merged.email = incoming.email;
  if (!merged.company && incoming.company) merged.company = incoming.company;
  if (!merged.designation && incoming.designation)
    merged.designation = incoming.designation;
  if (!merged.notes && incoming.notes) merged.notes = incoming.notes;
  if (!merged.fullName && incoming.fullName) merged.fullName = incoming.fullName;
  if (!merged.firstName && incoming.firstName)
    merged.firstName = incoming.firstName;
  if (!merged.lastName && incoming.lastName) merged.lastName = incoming.lastName;

  const groups = new Set<string>([
    ...(merged.categoryIds ?? []),
    ...(incoming.categoryIds ?? []),
  ]);
  merged.categoryIds = [...groups];

  merged.updatedAt = Math.max(
    merged.updatedAt ?? 0,
    incoming.updatedAt ?? 0,
    Date.now(),
  );
  merged.searchIndex = buildSearchIndex(merged);
  return merged;
}

/**
 * Restore a backup into the database.
 *
 * - `merge` (default, non-destructive): keep everything currently in the app,
 *   add records that don't exist yet, and enrich existing contacts (filling
 *   blanks + unioning groups). Nothing the user created is lost.
 * - `replace`: wipe the database first, then load the file verbatim — a clean
 *   "open this saved state" experience.
 */
export async function restoreBackup(
  data: BackupData,
  mode: RestoreMode,
): Promise<RestoreSummary> {
  const db = getDB();
  const summary: RestoreSummary = {
    mode,
    contactsAdded: 0,
    contactsUpdated: 0,
    categoriesAdded: 0,
    templatesAdded: 0,
    campaignsAdded: 0,
    messagesAdded: 0,
  };

  await db.transaction(
    "rw",
    [
      db.contacts,
      db.categories,
      db.templates,
      db.campaigns,
      db.campaignMessages,
      db.settings,
    ],
    async () => {
      if (mode === "replace") {
        await Promise.all([
          db.contacts.clear(),
          db.categories.clear(),
          db.templates.clear(),
          db.campaigns.clear(),
          db.campaignMessages.clear(),
          db.settings.clear(),
        ]);
      }

      // Contacts — merge by id (the normalized phone number).
      for (const incoming of data.contacts) {
        if (!incoming?.id) continue;
        const existing =
          mode === "merge" ? await db.contacts.get(incoming.id) : undefined;
        if (existing) {
          await db.contacts.put(mergeContactRecords(existing, incoming));
          summary.contactsUpdated++;
        } else {
          const record = incoming.searchIndex
            ? incoming
            : { ...incoming, searchIndex: buildSearchIndex(incoming) };
          await db.contacts.put(record);
          summary.contactsAdded++;
        }
      }

      // Other tables — add anything missing; never clobber existing edits.
      const addMissing = async <T extends { id: string }>(
        table: Table<T, string>,
        items: T[],
      ): Promise<number> => {
        let added = 0;
        for (const item of items) {
          if (!item?.id) continue;
          if (mode === "merge" && (await table.get(item.id))) continue;
          await table.put(item);
          added++;
        }
        return added;
      };

      summary.categoriesAdded = await addMissing(db.categories, data.categories);
      summary.templatesAdded = await addMissing(db.templates, data.templates);
      summary.campaignsAdded = await addMissing(db.campaigns, data.campaigns);
      summary.messagesAdded = await addMissing(
        db.campaignMessages,
        data.campaignMessages,
      );

      // Settings — restore on replace; on merge only fill if none exist.
      if (data.settings.length) {
        if (mode === "replace") {
          await db.settings.bulkPut(data.settings);
        } else {
          for (const s of data.settings) {
            if (!(await db.settings.get(s.id))) await db.settings.put(s);
          }
        }
      }
    },
  );

  return summary;
}

/** Wipe every table for a clean, fresh start. */
export async function clearAllData(): Promise<void> {
  const db = getDB();
  await db.transaction(
    "rw",
    [
      db.contacts,
      db.categories,
      db.templates,
      db.campaigns,
      db.campaignMessages,
      db.settings,
    ],
    async () => {
      await Promise.all([
        db.contacts.clear(),
        db.categories.clear(),
        db.templates.clear(),
        db.campaigns.clear(),
        db.campaignMessages.clear(),
        db.settings.clear(),
      ]);
    },
  );
}

/** Drop the PWA's cached assets (the service-worker Cache Storage). */
export async function clearAppCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    // Caches are best-effort; ignore failures.
  }
}
