"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  UserRound,
  Phone,
  Minus,
  Plus,
  MessageCircle,
  Check,
  Trash2,
  RotateCcw,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import type { AppSettings, WhatsAppApp } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { settingsRepo } from "../lib/repository";
import { contactsRepo } from "@/features/contacts/lib/repository";
import { deriveFirstName } from "@/features/contacts/lib/name";
import { DataBackupSection } from "./DataBackupSection";
import { ShortlistExportSection } from "./ShortlistExportSection";

export function SettingsManager() {
  const router = useRouter();
  const settings =
    useLiveQuery(() => settingsRepo.get(), []) ?? DEFAULT_SETTINGS;

  const update = (patch: Partial<AppSettings>) =>
    void settingsRepo.update(patch);

  const examples = ["Ramesh Kumar", "K Ramesh", "Sai Krishna Reddy"];

  const removed = useLiveQuery(() => contactsRepo.removedList(), []) ?? [];

  const restoreContact = async (id: string) => {
    haptic("light");
    await contactsRepo.restore([id]);
  };

  const deleteForever = async (id: string, label: string) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Permanently delete ${label}? This can't be undone. (They stay blocked from re-import only while kept here. Deleting forever lets a future import re-add them.)`,
      )
    ) {
      return;
    }
    haptic("warning");
    await contactsRepo.delete([id]);
  };

  const whatsappOptions: { value: WhatsAppApp; label: string; hint: string }[] = [
    {
      value: "personal",
      label: "WhatsApp (default)",
      hint: "Opens the regular WhatsApp app (whatsapp://).",
    },
    {
      value: "business",
      label: "WhatsApp Business",
      hint: "Tries the Business app, then falls back to wa.me if it doesn't open.",
    },
    {
      value: "wa_me",
      label: "Universal link (wa.me)",
      hint: "Best on laptop/desktop. Always works; the device picks the app.",
    },
  ];

  return (
    <div className="min-h-dvh">
      <header className="glass sticky top-0 z-30 border-b border-border/60">
        <div className="flex items-center gap-2 px-4 pb-3 pt-[max(0.9rem,env(safe-area-inset-top))]">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            aria-label="Back"
            className="-ml-2"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Settings</h1>
        </div>
      </header>

      <div className="space-y-6 p-4 pb-[calc(env(safe-area-inset-bottom)+2.5rem)]">
        {/* First name extraction */}
        <section className="rounded-3xl border border-hairline bg-card p-5 shadow-card">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <UserRound className="h-[1.05rem] w-[1.05rem]" aria-hidden />
            </span>
            <h2 className="font-bold tracking-tight text-foreground">First name</h2>
          </div>

          <label className="flex items-start justify-between gap-4 py-2">
            <span>
              <span className="block font-medium text-foreground">
                Use first word only
              </span>
              <span className="block text-sm text-muted-foreground">
                “Ramesh Kumar” becomes “Ramesh” in messages.
              </span>
            </span>
            <Switch
              checked={settings.firstNameFirstWordOnly}
              onCheckedChange={(v) => update({ firstNameFirstWordOnly: v })}
              aria-label="Use first word only"
            />
          </label>

          {settings.firstNameFirstWordOnly && (
            <div className="mt-2 flex items-center justify-between gap-4 border-t border-border/60 py-3">
              <span>
                <span className="block font-medium text-foreground">
                  Keep next word if shorter than
                </span>
                <span className="block text-sm text-muted-foreground">
                  Handles initials like “K Ramesh”.
                </span>
              </span>
              <Stepper
                value={settings.firstNameMinLength}
                min={1}
                max={6}
                onChange={(v) => update({ firstNameMinLength: v })}
              />
            </div>
          )}

          {/* Live examples */}
          <div className="mt-3 space-y-1.5 rounded-2xl bg-elevated p-3.5 ring-1 ring-inset ring-hairline">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Examples
            </p>
            {examples.map((ex) => (
              <div key={ex} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{ex}</span>
                <span className="font-semibold text-foreground">
                  {deriveFirstName(ex, settings) || "-"}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* WhatsApp app preference */}
        <section className="rounded-3xl border border-hairline bg-card p-5 shadow-card">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <MessageCircle className="h-[1.05rem] w-[1.05rem]" aria-hidden />
            </span>
            <h2 className="font-bold tracking-tight text-foreground">WhatsApp app</h2>
          </div>
          <p className="mb-3 text-sm text-muted-foreground">
            Which app the Send button opens by default. The send screen always shows a
            wa.me fallback link in case a chosen app isn&apos;t installed.
          </p>
          <div className="space-y-2">
            {whatsappOptions.map((opt) => {
              const selected = settings.whatsappApp === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update({ whatsappApp: opt.value })}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all active:scale-[0.99]",
                    selected
                      ? "border-primary/40 bg-accent ring-1 ring-primary/15"
                      : "border-hairline bg-card hover:bg-secondary",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-foreground">
                      {opt.label}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {opt.hint}
                    </span>
                  </span>
                  {selected && (
                    <Check className="h-5 w-5 shrink-0 text-primary" />
                  )}
                </button>
              );
            })}
          </div>

          <label className="mt-3 flex items-start justify-between gap-4 border-t border-border/60 py-3">
            <span>
              <span className="block font-medium text-foreground">
                Show wa.me fallback link
              </span>
              <span className="block text-sm text-muted-foreground">
                Adds a manual “Open via wa.me” link under the Send button. Off by
                default; Send already falls back to wa.me on its own.
              </span>
            </span>
            <Switch
              checked={settings.showWaMeFallback}
              onCheckedChange={(v) => update({ showWaMeFallback: v })}
              aria-label="Show wa.me fallback link"
            />
          </label>
        </section>

        {/* Data, backup & fresh start */}
        <DataBackupSection />

        {/* Shortlist export — a safe, separate copy of just the keepers */}
        <ShortlistExportSection />

        {/* Removed contacts — restore mistakes or delete for good */}
        <section className="rounded-3xl border border-hairline bg-card p-5 shadow-card">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <UserX className="h-[1.05rem] w-[1.05rem]" aria-hidden />
            </span>
            <h2 className="font-bold tracking-tight text-foreground">Removed contacts</h2>
          </div>
          <p className="mb-3 text-sm text-muted-foreground">
            Contacts you removed (no WhatsApp / out of domain). They&apos;re hidden
            from every list and skipped on import. Restore one to bring it back, or
            delete it for good.
          </p>
          {removed.length === 0 ? (
            <p className="rounded-2xl bg-elevated p-3.5 ring-1 ring-inset ring-hairline text-sm text-muted-foreground">
              No removed contacts.
            </p>
          ) : (
            <ul className="space-y-2">
              {removed.map((c) => {
                const label = c.fullName || c.phone;
                return (
                  <li
                    key={c.id}
                    className="flex items-center gap-2 rounded-2xl border border-hairline bg-card p-2.5 shadow-soft"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">
                        {label}
                      </span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {c.phone}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => restoreContact(c.id)}
                    >
                      <RotateCcw className="h-4 w-4" />
                      Restore
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteForever(c.id, label)}
                      aria-label={`Delete ${label} forever`}
                    >
                      <Trash2 className="h-5 w-5 text-destructive" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Phone normalization (informational) */}
        <section className="rounded-3xl border border-hairline bg-card p-5 shadow-card">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Phone className="h-[1.05rem] w-[1.05rem]" aria-hidden />
            </span>
            <h2 className="font-bold tracking-tight text-foreground">Phone numbers</h2>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Numbers are standardized to Indian E.164 format on import. Existing
            country codes are detected, so a contact already saved with{" "}
            <span className="font-medium text-foreground">+91</span> is never
            prefixed again, and duplicates are merged by number.
          </p>
        </section>
      </div>
    </div>
  );
}

function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-2xl border border-hairline bg-card p-1 shadow-soft">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="Decrease"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground hover:bg-secondary disabled:opacity-40"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="w-6 text-center text-base font-bold tabular-nums text-foreground">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="Increase"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground hover:bg-secondary disabled:opacity-40"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
