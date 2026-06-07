"use client";

import * as React from "react";
import { Upload, FileWarning, Check } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { haptic } from "@/lib/haptics";
import { parseVCF } from "../lib/vcf";
import { contactsRepo } from "../lib/repository";
import type { ImportResult } from "../lib/import";

interface ImportSheetProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

type Stage = "select" | "preview" | "done";

export function ImportSheet({ open, onClose, onImported }: ImportSheetProps) {
  const [stage, setStage] = React.useState<Stage>("select");
  const [busy, setBusy] = React.useState(false);
  const [fileNames, setFileNames] = React.useState<string[]>([]);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const reset = React.useCallback(() => {
    setStage("select");
    setResult(null);
    setFileNames([]);
    setBusy(false);
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const names: string[] = [];
      const cards = [];
      for (const file of Array.from(files)) {
        names.push(file.name);
        const text = await file.text();
        cards.push(...parseVCF(text));
      }
      setFileNames(names);
      const preview = await contactsRepo.previewImport(cards);
      setResult(preview);
      setStage("preview");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!result) return;
    setBusy(true);
    try {
      await contactsRepo.commitImport(result.upserts);
      haptic("success");
      setStage("done");
      onImported();
    } finally {
      setBusy(false);
    }
  }

  const summary = result?.summary;

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title="Import contacts"
      description="Import one or more .vcf files. Duplicates are merged by phone number."
      footer={
        stage === "preview" ? (
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={reset}>
              Choose other files
            </Button>
            <Button className="flex-1" onClick={confirm} disabled={busy}>
              {busy ? "Importing…" : "Confirm import"}
            </Button>
          </div>
        ) : stage === "done" ? (
          <Button className="w-full" onClick={handleClose}>
            Done
          </Button>
        ) : undefined
      }
    >
      {stage === "select" && (
        <div className="space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept=".vcf,text/vcard"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex min-h-[160px] w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-input bg-secondary/40 px-6 text-center transition-colors hover:border-primary/50"
          >
            <Upload className="h-8 w-8 text-primary" />
            <div>
              <p className="font-medium text-foreground">
                {busy ? "Reading files…" : "Tap to select .vcf files"}
              </p>
              <p className="text-sm text-muted-foreground">
                Multiple files supported
              </p>
            </div>
          </button>
        </div>
      )}

      {stage === "preview" && summary && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            From {fileNames.length} file{fileNames.length === 1 ? "" : "s"}:{" "}
            {fileNames.join(", ")}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Imported" value={summary.imported} highlight />
            <Stat label="Updated" value={summary.updated} />
            <Stat label="Merged" value={summary.merged} />
            <Stat label="Skipped" value={summary.skipped} />
            {summary.blocked > 0 && (
              <Stat label="Blocked (removed)" value={summary.blocked} />
            )}
          </div>

          {summary.warnings.length > 0 && (
            <div className="rounded-lg border border-border bg-secondary/40 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <FileWarning className="h-4 w-4 text-destructive" />
                {summary.warnings.length} record
                {summary.warnings.length === 1 ? "" : "s"} not imported
              </div>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-sm text-muted-foreground">
                {summary.warnings.slice(0, 50).map((w, i) => (
                  <li key={i} className="truncate">
                    {w.fullName} — {w.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {stage === "done" && summary && (
        <div className="flex flex-col items-center py-6 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success">
            <Check className="h-7 w-7 text-success-foreground" />
          </div>
          <h3 className="text-base font-semibold text-foreground">
            Import complete
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {summary.imported} added · {summary.updated} updated ·{" "}
            {summary.merged} merged
          </p>
        </div>
      )}
    </Sheet>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        highlight ? "border-primary/30 bg-accent" : "border-border bg-card"
      }`}
    >
      <div className="text-2xl font-semibold text-foreground">{value}</div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
    </div>
  );
}
