"use client";

import * as React from "react";
import {
  Database,
  Download,
  Upload,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Merge,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import {
  downloadBackup,
  parseBackup,
  restoreBackup,
  clearAllData,
  clearAppCaches,
  countsOf,
  computeSignature,
  setLastBackup,
  type BackupCounts,
  type BackupData,
  type RestoreMode,
} from "@/lib/backup/backup";
import {
  estimateStorage,
  formatBytes,
  isStoragePersisted,
  requestPersistentStorage,
} from "@/lib/storage/persist";

type Status = { kind: "ok" | "err"; text: string } | null;

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

export function DataBackupSection() {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<Status>(null);
  const [pending, setPending] = React.useState<{
    data: BackupData;
    counts: BackupCounts;
  } | null>(null);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [persisted, setPersisted] = React.useState<boolean | null>(null);
  const [usage, setUsage] = React.useState<string | null>(null);

  const refreshStorage = React.useCallback(() => {
    void isStoragePersisted().then(setPersisted);
    void estimateStorage().then((e) => e && setUsage(formatBytes(e.usage)));
  }, []);

  React.useEffect(() => {
    refreshStorage();
  }, [refreshStorage]);

  const onExport = async () => {
    setBusy("export");
    setStatus(null);
    try {
      const c = await downloadBackup();
      // Mark the data clean so the header Save button's dirty dot clears too.
      setLastBackup(await computeSignature());
      setStatus({
        kind: "ok",
        text: `Saved ${c.contacts} contacts, ${c.categories} groups, ${c.templates} templates and ${c.campaigns} campaigns to a file.`,
      });
      refreshStorage();
    } catch (e) {
      setStatus({ kind: "err", text: errorText(e) });
    } finally {
      setBusy(null);
    }
  };

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setBusy("read");
    setStatus(null);
    try {
      const data = parseBackup(await file.text());
      setPending({ data, counts: countsOf(data) });
    } catch (err) {
      setStatus({ kind: "err", text: errorText(err) });
    } finally {
      setBusy(null);
    }
  };

  const onRestore = async (mode: RestoreMode) => {
    if (!pending) return;
    setBusy("restore");
    try {
      const s = await restoreBackup(pending.data, mode);
      setPending(null);
      setStatus({
        kind: "ok",
        text:
          mode === "replace"
            ? `Loaded the backup: ${s.contactsAdded} contacts, ${s.categoriesAdded} groups, ${s.templatesAdded} templates, ${s.campaignsAdded} campaigns.`
            : `Merged in: ${s.contactsAdded} new and ${s.contactsUpdated} updated contacts, ${s.categoriesAdded} new groups, ${s.templatesAdded} templates, ${s.campaignsAdded} campaigns. Nothing was lost.`,
      });
      refreshStorage();
    } catch (err) {
      setStatus({ kind: "err", text: errorText(err) });
    } finally {
      setBusy(null);
    }
  };

  const onClear = async () => {
    setBusy("clear");
    try {
      await clearAllData();
      await clearAppCaches();
      // Hard reload into a clean app.
      window.location.href = "/people";
    } catch (err) {
      setStatus({ kind: "err", text: errorText(err) });
      setBusy(null);
      setConfirmClear(false);
    }
  };

  const enablePersist = async () => {
    setPersisted(await requestPersistentStorage());
  };

  return (
    <section className="rounded-3xl border border-hairline bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <Database className="h-[1.05rem] w-[1.05rem]" aria-hidden />
        </span>
        <h2 className="font-bold tracking-tight text-foreground">Data &amp; backup</h2>
      </div>

      {/* Storage durability */}
      <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-elevated p-3.5 ring-1 ring-inset ring-hairline">
        <div className="flex items-start gap-2">
          {persisted ? (
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          ) : (
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          )}
          <div className="text-sm">
            <p className="font-medium text-foreground">
              {persisted ? "Storage is durable" : "Storage not yet durable"}
            </p>
            <p className="text-muted-foreground">
              {persisted
                ? "Your data is kept until you clear it."
                : "Allow durable storage so data isn't auto-evicted."}
              {usage ? ` · ${usage} used` : ""}
            </p>
          </div>
        </div>
        {!persisted && (
          <Button size="sm" variant="outline" onClick={enablePersist}>
            Allow
          </Button>
        )}
      </div>

      {/* Status line */}
      {status && (
        <div
          className={
            "mb-3 flex items-start gap-2 rounded-2xl p-3.5 text-sm " +
            (status.kind === "ok"
              ? "bg-accent text-accent-foreground"
              : "bg-destructive/10 text-destructive")
          }
        >
          {status.kind === "ok" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{status.text}</span>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2">
        <Button
          className="w-full"
          onClick={onExport}
          disabled={busy !== null}
        >
          <Download className="h-5 w-5" />
          {busy === "export" ? "Saving…" : "Export everything"}
        </Button>
        <p className="px-1 text-xs text-muted-foreground">
          Downloads a single file with all contacts, groups, templates and
          campaigns. Save it to a folder or cloud drive.
        </p>

        <Button
          className="mt-1 w-full"
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={busy !== null}
        >
          <Upload className="h-5 w-5" />
          {busy === "read" ? "Reading…" : "Restore from backup"}
        </Button>
        <p className="px-1 text-xs text-muted-foreground">
          Load a backup file. Merge keeps what you have and adds the rest, or
          replace everything for a clean load.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={onFileChosen}
        />

        <Button
          className="mt-1 w-full text-destructive hover:bg-destructive/10"
          variant="ghost"
          onClick={() => setConfirmClear(true)}
          disabled={busy !== null}
        >
          <Trash2 className="h-5 w-5" />
          Clear all data &amp; start fresh
        </Button>
      </div>

      {/* Restore mode chooser */}
      <Sheet
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Restore backup"
        description={
          pending
            ? `This file has ${pending.counts.contacts} contacts, ${pending.counts.categories} groups, ${pending.counts.templates} templates and ${pending.counts.campaigns} campaigns.`
            : undefined
        }
      >
        <div className="space-y-3">
          <button
            type="button"
            disabled={busy === "restore"}
            onClick={() => onRestore("merge")}
            className="flex w-full items-start gap-3 rounded-2xl border border-hairline bg-card p-4 text-left shadow-soft transition-all hover:bg-secondary active:scale-[0.99] disabled:opacity-50"
          >
            <Merge className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <span>
              <span className="block font-semibold text-foreground">
                Merge (recommended)
              </span>
              <span className="block text-sm text-muted-foreground">
                Keep everything currently in the app and add anything missing.
                Existing contacts are enriched and groups are preserved.
              </span>
            </span>
          </button>

          <button
            type="button"
            disabled={busy === "restore"}
            onClick={() => onRestore("replace")}
            className="flex w-full items-start gap-3 rounded-2xl border border-hairline bg-card p-4 text-left shadow-soft transition-all hover:bg-secondary active:scale-[0.99] disabled:opacity-50"
          >
            <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-foreground" />
            <span>
              <span className="block font-semibold text-foreground">
                Replace everything
              </span>
              <span className="block text-sm text-muted-foreground">
                Erase the current data first, then load this file exactly as
                saved.
              </span>
            </span>
          </button>

          {busy === "restore" && (
            <p className="text-center text-sm text-muted-foreground">
              Restoring…
            </p>
          )}
        </div>
      </Sheet>

      {/* Clear confirmation */}
      <Sheet
        open={confirmClear}
        onClose={() => (busy === "clear" ? undefined : setConfirmClear(false))}
        title="Start fresh?"
        description="This permanently erases all contacts, groups, templates and campaigns on this device."
        footer={
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              onClick={() => setConfirmClear(false)}
              disabled={busy === "clear"}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onClear}
              disabled={busy === "clear"}
            >
              {busy === "clear" ? "Clearing…" : "Erase everything"}
            </Button>
          </div>
        }
      >
        <div className="flex items-start gap-2 rounded-2xl bg-destructive/10 p-3.5 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Export a backup first if you might want this data again. This can't
            be undone.
          </span>
        </div>
      </Sheet>
    </section>
  );
}
