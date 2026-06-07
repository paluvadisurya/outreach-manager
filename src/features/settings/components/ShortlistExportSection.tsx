"use client";

import * as React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Star, FileJson, FileSpreadsheet, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDB } from "@/lib/db/db";
import { categoriesRepo } from "@/features/categories/lib/repository";
import {
  downloadShortlistJson,
  downloadShortlistCsv,
} from "@/features/contacts/lib/shortlistExport";

type Status = { kind: "ok" | "err"; text: string } | null;

/**
 * Export the curated Shortlist on its own — a safe, separate copy of just the
 * keepers. JSON is a re-importable backup (load it back via Restore → Replace to
 * boot a fresh app from only the shortlist); CSV opens in any spreadsheet.
 */
export function ShortlistExportSection() {
  const count = useLiveQuery(async () => {
    const shortlist = await categoriesRepo.getShortlist();
    if (!shortlist) return 0;
    const contacts = await getDB().contacts.toArray();
    return contacts.filter(
      (c) => !c.removed && c.categoryIds.includes(shortlist.id),
    ).length;
  }, []);

  const [busy, setBusy] = React.useState<"json" | "csv" | null>(null);
  const [status, setStatus] = React.useState<Status>(null);
  const empty = (count ?? 0) === 0;

  const run = async (kind: "json" | "csv") => {
    setBusy(kind);
    setStatus(null);
    try {
      const n =
        kind === "json"
          ? await downloadShortlistJson()
          : await downloadShortlistCsv();
      setStatus({
        kind: "ok",
        text: `Exported ${n} shortlisted contact${n === 1 ? "" : "s"} as ${kind.toUpperCase()}.`,
      });
    } catch (e) {
      setStatus({
        kind: "err",
        text: e instanceof Error ? e.message : "Something went wrong.",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-3xl border border-hairline bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <Star className="h-[1.05rem] w-[1.05rem]" aria-hidden />
        </span>
        <h2 className="font-bold tracking-tight text-foreground">Shortlist</h2>
      </div>

      <p className="mb-3 text-sm text-muted-foreground">
        Keep a separate, safe copy of just your shortlisted keepers
        {count !== undefined ? ` (${count} right now)` : ""}. The JSON file can be
        loaded back later via Restore → Replace to start the app from only this
        list.
      </p>

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

      {empty ? (
        <p className="rounded-2xl bg-elevated p-3.5 text-sm text-muted-foreground ring-1 ring-inset ring-hairline">
          Nothing shortlisted yet. Use Clean up on the People tab to keep the
          contacts you want here.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={() => run("json")}
            disabled={busy !== null}
          >
            <FileJson className="h-5 w-5" />
            {busy === "json" ? "Exporting…" : "JSON"}
          </Button>
          <Button
            variant="outline"
            onClick={() => run("csv")}
            disabled={busy !== null}
          >
            <FileSpreadsheet className="h-5 w-5" />
            {busy === "csv" ? "Exporting…" : "CSV"}
          </Button>
        </div>
      )}
    </section>
  );
}
