"use client";

import * as React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CloudUpload, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  computeSignature,
  downloadBackup,
  getLastBackup,
  setLastBackup,
  type LastBackup,
} from "@/lib/backup/backup";

/** "3m", "2h", "5d" — compact relative age for the saved tooltip. */
function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/**
 * One-tap "Save backup" affordance for the header. Shows a dot when there are
 * unsaved changes since the last export (compared by content fingerprint).
 * Tapping exports the whole app as a single JSON file via the browser/share
 * sheet, from where the user replaces their iCloud copy — the only thing iOS
 * actually allows. After a successful save the data is marked clean.
 */
export function BackupButton() {
  const signature = useLiveQuery(() => computeSignature(), []);
  const [last, setLast] = React.useState<LastBackup | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [justSaved, setJustSaved] = React.useState(false);

  React.useEffect(() => {
    setLast(getLastBackup());
  }, []);

  const dirty =
    signature !== undefined && (!last || last.signature !== signature);

  const save = async () => {
    if (busy || signature === undefined) return;
    setBusy(true);
    try {
      await downloadBackup();
      const sig = await computeSignature();
      setLastBackup(sig);
      setLast({ at: Date.now(), signature: sig });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch {
      // Surface nothing here; the full Settings flow reports errors in detail.
    } finally {
      setBusy(false);
    }
  };

  const title = busy
    ? "Saving backup…"
    : dirty
      ? "Unsaved changes — tap to save a backup"
      : last
        ? `Backed up ${ago(last.at)}`
        : "Save a backup";

  return (
    <button
      type="button"
      onClick={save}
      disabled={busy}
      aria-label={title}
      title={title}
      className={cn(
        "relative flex min-h-touch min-w-touch items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60",
        dirty && "text-foreground",
      )}
    >
      {busy ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : justSaved ? (
        <Check className="h-5 w-5 text-primary" />
      ) : (
        <CloudUpload className="h-5 w-5" />
      )}
      {dirty && !busy && !justSaved && (
        <span
          aria-hidden
          className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[hsl(var(--section))] ring-2 ring-card"
        />
      )}
    </button>
  );
}
