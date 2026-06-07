import type { BackupData } from "@/lib/backup/backup";
import { BACKUP_APP, BACKUP_VERSION } from "@/lib/backup/backup";
import { getDB } from "@/lib/db/db";
import { categoriesRepo } from "@/features/categories/lib/repository";
import type { Contact } from "@/lib/types";

/**
 * Export just the curated Shortlist — the keepers from the cleanup triage — so
 * the user can keep a safe copy of it, separate from the full backup.
 *
 * The JSON export is deliberately a *valid `BackupData`* (app/version header)
 * filtered to the Shortlist contacts + the Shortlist group. That means the
 * existing Settings → Restore → Replace flow can later load it verbatim, which
 * is exactly the "one day I'll wipe everything and reload the app from just the
 * shortlist" goal — no new import code, no new destructive path.
 */

/** The active (non-removed) Shortlist members, or [] when there's no Shortlist. */
async function shortlistMembers(): Promise<Contact[]> {
  const shortlist = await categoriesRepo.getShortlist();
  if (!shortlist) return [];
  const contacts = await getDB().contacts.toArray();
  return contacts.filter(
    (c) => !c.removed && c.categoryIds.includes(shortlist.id),
  );
}

/** Build a `BackupData` containing only the Shortlist contacts + group. */
export async function buildShortlistBackup(): Promise<BackupData> {
  const db = getDB();
  const [shortlist, members, settings] = await Promise.all([
    categoriesRepo.getShortlist(),
    shortlistMembers(),
    db.settings.toArray(),
  ]);
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    contacts: members,
    categories: shortlist ? [shortlist] : [],
    templates: [],
    campaigns: [],
    campaignMessages: [],
    settings,
    calls: [],
    events: [],
  };
}

/** Quote a CSV field, doubling embedded quotes (RFC 4180). */
function csvCell(value: string | undefined): string {
  const s = (value ?? "").replace(/\r?\n/g, " ").trim();
  return `"${s.replace(/"/g, '""')}"`;
}

/** Render the Shortlist members as a CSV string with a header row. */
export function shortlistCsv(members: Contact[]): string {
  const header = ["Name", "Phone", "Company", "Designation", "Email", "Notes"];
  const rows = members.map((c) =>
    [c.fullName, c.phone, c.company, c.designation, c.email, c.notes]
      .map(csvCell)
      .join(","),
  );
  return [header.map(csvCell).join(","), ...rows].join("\r\n");
}

/** A timestamped, filesystem-safe filename for a shortlist export. */
function shortlistFilename(ext: "json" | "csv", now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `shortlist-${stamp}.${ext}`;
}

/** Trigger a browser download of `blob` as `filename` (mirrors backup.ts). */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Download the Shortlist as a re-importable JSON backup. Returns the count. */
export async function downloadShortlistJson(): Promise<number> {
  const data = await buildShortlistBackup();
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  triggerDownload(blob, shortlistFilename("json"));
  return data.contacts.length;
}

/** Download the Shortlist as a CSV. Returns the count. */
export async function downloadShortlistCsv(): Promise<number> {
  const members = await shortlistMembers();
  const blob = new Blob([shortlistCsv(members)], {
    type: "text/csv;charset=utf-8",
  });
  triggerDownload(blob, shortlistFilename("csv"));
  return members.length;
}
