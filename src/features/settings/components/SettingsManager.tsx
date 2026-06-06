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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { AppSettings, WhatsAppApp } from "@/lib/types";
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

  const whatsappOptions: { value: WhatsAppApp; label: string; hint: string }[] = [
    {
      value: "business",
      label: "WhatsApp Business",
      hint: "Opens whatsapp-business:// — best if you message from Business.",
    },
    {
      value: "personal",
      label: "WhatsApp",
      hint: "Opens the regular WhatsApp app (whatsapp://).",
    },
    {
      value: "wa_me",
      label: "Universal link (wa.me)",
      hint: "Always works; lets the device pick the app.",
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
          <h1 className="text-xl font-bold text-foreground">Settings</h1>
        </div>
      </header>

      <div className="space-y-6 p-4 pb-[calc(env(safe-area-inset-bottom)+2.5rem)]">
        {/* First name extraction */}
        <section className="rounded-2xl border border-border/70 bg-card/80 p-4 shadow-soft">
          <div className="mb-3 flex items-center gap-2">
            <UserRound className="h-5 w-5 text-muted-foreground" aria-hidden />
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

        {/* WhatsApp app preference */}
        <section className="rounded-2xl border border-border/70 bg-card/80 p-4 shadow-soft">
          <div className="mb-3 flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-muted-foreground" aria-hidden />
            <h2 className="font-bold text-foreground">WhatsApp app</h2>
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
                    "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
                    selected
                      ? "border-primary bg-accent"
                      : "border-input bg-card hover:bg-secondary",
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
        </section>

        {/* Data, backup & fresh start */}
        <DataBackupSection />

        {/* Phone normalization (informational) */}
        <section className="rounded-2xl border border-border/70 bg-card/80 p-4 shadow-soft">
          <div className="mb-2 flex items-center gap-2">
            <Phone className="h-5 w-5 text-muted-foreground" aria-hidden />
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
