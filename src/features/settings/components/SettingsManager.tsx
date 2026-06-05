"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, UserRound, Phone, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { AppSettings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { settingsRepo } from "../lib/repository";
import { deriveFirstName } from "@/features/contacts/lib/name";
import { DataBackupSection } from "./DataBackupSection";

export function SettingsManager() {
  const router = useRouter();
  const settings =
    useLiveQuery(() => settingsRepo.get(), []) ?? DEFAULT_SETTINGS;

  const update = (patch: Partial<AppSettings>) =>
    void settingsRepo.update(patch);

  const examples = ["Ramesh Kumar", "K Ramesh", "Sai Krishna Reddy"];

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
          <h1 className="text-xl font-bold text-foreground">Settings</h1>
        </div>
      </header>

      <div className="space-y-6 p-4 pb-[calc(env(safe-area-inset-bottom)+2.5rem)]">
        {/* First name extraction */}
        <section className="rounded-2xl border border-border/70 bg-card/80 p-4 shadow-soft">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent">
              <UserRound className="h-5 w-5 text-primary" />
            </span>
            <h2 className="font-bold text-foreground">First name</h2>
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
          <div className="mt-3 space-y-1.5 rounded-xl bg-secondary/50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Examples
            </p>
            {examples.map((ex) => (
              <div key={ex} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{ex}</span>
                <span className="font-semibold text-foreground">
                  {deriveFirstName(ex, settings) || "—"}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Data, backup & fresh start */}
        <DataBackupSection />

        {/* Phone normalization (informational) */}
        <section className="rounded-2xl border border-border/70 bg-card/80 p-4 shadow-soft">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent">
              <Phone className="h-5 w-5 text-primary" />
            </span>
            <h2 className="font-bold text-foreground">Phone numbers</h2>
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
    <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
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
