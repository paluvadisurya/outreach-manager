"use client";

import * as React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Activity,
  Users,
  Star,
  UserX,
  Megaphone,
  LayoutTemplate,
  Send,
  Phone,
  PhoneCall,
  CalendarClock,
  ListFilter,
  X,
  Check,
  type LucideIcon,
} from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import type { CampaignMessage } from "@/lib/types";
import { contactsRepo } from "@/features/contacts/lib/repository";
import { campaignsRepo } from "@/features/campaigns/lib/repository";
import { templatesRepo } from "@/features/templates/lib/repository";
import { categoriesRepo } from "@/features/categories/lib/repository";
import { callsRepo } from "@/features/calls/lib/repository";
import { eventsRepo } from "../lib/repository";
import {
  type RangePreset,
  resolveRange,
  tallyByDay,
  tallyByKey,
  mergeDaySeries,
  dayShortLabel,
} from "../lib/derive";

const RANGES: { value: RangePreset; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "all", label: "All" },
  { value: "custom", label: "Custom" },
];

/** A yyyy-mm-dd string for an `<input type="date">`, default-filling the picker. */
function isoDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const SERIES = [
  { key: "sent", label: "Messages", cls: "bg-amber-400" },
  { key: "calls", label: "Calls", cls: "bg-primary" },
  { key: "contacts", label: "Contacts added", cls: "bg-sky-400" },
] as const;

type Scope = { kind: "campaign" | "template"; id: string } | null;

export function AnalyticsManager() {
  const contacts = useLiveQuery(() => contactsRepo.all(), []);
  const removed = useLiveQuery(() => contactsRepo.removedList(), []);
  const campaigns = useLiveQuery(() => campaignsRepo.all(), []) ?? [];
  const templates = useLiveQuery(() => templatesRepo.all(), []) ?? [];
  const messages = useLiveQuery(() => campaignsRepo.allMessages(), []);
  const calls = useLiveQuery(() => callsRepo.list(), []);
  const events = useLiveQuery(() => eventsRepo.all(), []);
  const shortlist = useLiveQuery(() => categoriesRepo.getShortlist(), []);

  const [preset, setPreset] = React.useState<RangePreset>("30d");
  // Custom from/to window (yyyy-mm-dd) used only when preset === "custom".
  const [customRange, setCustomRange] = React.useState(() => ({
    from: isoDate(Date.now() - 29 * 86_400_000),
    to: isoDate(Date.now()),
  }));
  const [scope, setScope] = React.useState<Scope>(null);
  const [scopeOpen, setScopeOpen] = React.useState(false);

  const campaignMap = React.useMemo(() => {
    const m = new Map<string, (typeof campaigns)[number]>();
    for (const c of campaigns) m.set(c.id, c);
    return m;
  }, [campaigns]);
  const templateName = (id: string) =>
    templates.find((t) => t.id === id)?.name ?? "Template";

  const loading =
    contacts === undefined ||
    removed === undefined ||
    messages === undefined ||
    calls === undefined ||
    events === undefined;

  // Earliest activity timestamp, for the "all time" left edge.
  const earliest = React.useMemo(() => {
    const stamps: number[] = [];
    for (const c of contacts ?? []) stamps.push(c.createdAt);
    for (const c of removed ?? []) stamps.push(c.createdAt);
    for (const e of calls ?? []) for (const h of e.history) stamps.push(h.at);
    for (const e of events ?? []) stamps.push(e.at);
    return stamps.length ? Math.min(...stamps) : Date.now();
  }, [contacts, removed, calls, events]);

  // The chosen custom window as epoch ms (end inclusive to the end of the day).
  const customMs = React.useMemo(() => {
    const from = new Date(`${customRange.from}T00:00:00`).getTime();
    const to = new Date(`${customRange.to}T23:59:59`).getTime();
    if (Number.isNaN(from) || Number.isNaN(to) || from > to) return undefined;
    return { from, to };
  }, [customRange]);

  const range = React.useMemo(
    () => resolveRange(preset, Date.now(), earliest, customMs),
    [preset, earliest, customMs],
  );

  // Apply the scope filter to messages and calls.
  const scopeMatchesMessage = React.useCallback(
    (m: CampaignMessage) => {
      if (!scope) return true;
      if (scope.kind === "campaign") return m.campaignId === scope.id;
      return m.templateId === scope.id;
    },
    [scope],
  );
  const scopeMatchesCall = React.useCallback(
    (campaignIds: string[]) => {
      if (!scope) return true;
      if (scope.kind === "campaign") return campaignIds.includes(scope.id);
      return campaignIds.some((cid) =>
        campaignMap.get(cid)?.templateIds.includes(scope.id),
      );
    },
    [scope, campaignMap],
  );

  const sentMessages = React.useMemo(
    () => (messages ?? []).filter((m) => m.status === "sent" && scopeMatchesMessage(m)),
    [messages, scopeMatchesMessage],
  );

  // Daily activity series (derived — works retroactively for existing data).
  const daily = React.useMemo(() => {
    const contactAdds = [
      ...(contacts ?? []).map((c) => c.createdAt),
      ...(removed ?? []).map((c) => c.createdAt),
    ];
    const callLogs: number[] = [];
    for (const e of calls ?? []) {
      if (!scopeMatchesCall(e.campaignIds)) continue;
      for (const h of e.history) callLogs.push(h.at);
    }
    const sentStamps = sentMessages.map((m) => m.updatedAt);
    return mergeDaySeries({
      sent: tallyByDay(sentStamps, range.from, range.to),
      calls: tallyByDay(callLogs, range.from, range.to),
      contacts: tallyByDay(contactAdds, range.from, range.to),
    });
  }, [contacts, removed, calls, sentMessages, range, scopeMatchesCall]);

  // Sums within the range, for the headline numbers under the chart.
  const rangeTotals = React.useMemo(() => {
    const sum = (key: (typeof SERIES)[number]["key"]) =>
      daily.reduce((n, r) => n + (r.values[key] ?? 0), 0);
    return { sent: sum("sent"), calls: sum("calls"), contacts: sum("contacts") };
  }, [daily]);

  // Breakdowns.
  const byCampaign = React.useMemo(() => {
    const map = tallyByKey(sentMessages, (m) => m.campaignId);
    return [...map.entries()]
      .map(([id, value]) => ({
        label: campaignMap.get(id)?.name ?? "Campaign",
        value,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [sentMessages, campaignMap]);

  const byTemplate = React.useMemo(() => {
    const map = tallyByKey(sentMessages, (m) => m.templateId);
    return [...map.entries()]
      .map(([id, value]) => ({ label: templateName(id), value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentMessages, templates]);

  const byOutcome = React.useMemo(() => {
    const scoped = (calls ?? []).filter((e) => scopeMatchesCall(e.campaignIds));
    const map = tallyByKey(scoped, (e) => e.outcome);
    const labels: Record<string, string> = {
      pending: "To call",
      called: "Called",
      no_answer: "No answer",
      skipped: "Skipped",
    };
    return [...map.entries()]
      .map(([id, value]) => ({ label: labels[id] ?? id, value }))
      .sort((a, b) => b.value - a.value);
  }, [calls, scopeMatchesCall]);

  // Call-log roll-ups across the (scoped) call list — fed straight from each
  // contact's editable history, so corrections/deletes are reflected live.
  const callInsights = React.useMemo(() => {
    const scoped = (calls ?? []).filter((e) => scopeMatchesCall(e.campaignIds));
    let timesCalled = 0;
    let peopleCalled = 0;
    for (const e of scoped) {
      const attempts = e.history.filter(
        (h) => h.outcome === "called" || h.outcome === "no_answer",
      ).length;
      timesCalled += attempts;
      if (attempts > 0) peopleCalled += 1;
    }
    return { timesCalled, peopleCalled };
  }, [calls, scopeMatchesCall]);

  const shortlistedCount = React.useMemo(() => {
    if (!shortlist) return 0;
    return (contacts ?? []).filter((c) => c.categoryIds.includes(shortlist.id))
      .length;
  }, [contacts, shortlist]);

  const scopeLabel = scope
    ? scope.kind === "campaign"
      ? (campaignMap.get(scope.id)?.name ?? "Campaign")
      : templateName(scope.id)
    : null;

  const overview: { label: string; value: number; icon: LucideIcon; tone: string }[] = [
    { label: "Contacts", value: contacts?.length ?? 0, icon: Users, tone: "text-sky-500" },
    { label: "Shortlisted", value: shortlistedCount, icon: Star, tone: "text-amber-500" },
    { label: "Removed", value: removed?.length ?? 0, icon: UserX, tone: "text-destructive" },
    { label: "Campaigns", value: campaigns.length, icon: Megaphone, tone: "text-primary" },
    { label: "Templates", value: templates.length, icon: LayoutTemplate, tone: "text-foreground" },
    { label: "Messages sent", value: sentMessages.length, icon: Send, tone: "text-amber-500" },
    {
      label: "People called",
      value: callInsights.peopleCalled,
      icon: PhoneCall,
      tone: "text-primary",
    },
    {
      label: "Times called",
      value: callInsights.timesCalled,
      icon: Phone,
      tone: "text-primary",
    },
    {
      label: "Scheduled",
      value: (calls ?? []).filter((e) => e.nextCallAt).length,
      icon: CalendarClock,
      tone: "text-foreground",
    },
  ];

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader title="Analytics" icon={Activity} hideAnalytics />

      {/* Range + scope controls */}
      <div className="space-y-2 border-b border-border/60 px-4 pb-3 pt-2">
        <div className="flex gap-1 rounded-2xl bg-elevated p-1 ring-1 ring-inset ring-hairline">
          {RANGES.map((r) => {
            const active = preset === r.value;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => {
                  haptic("light");
                  setPreset(r.value);
                }}
                aria-pressed={active}
                className={cn(
                  "flex-1 rounded-[0.85rem] px-2 py-1.5 text-xs font-semibold transition-all active:scale-[0.98]",
                  active
                    ? "bg-card text-foreground shadow-soft ring-1 ring-hairline"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r.label}
              </button>
            );
          })}
        </div>
        {preset === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customRange.from}
              max={customRange.to}
              onChange={(e) =>
                setCustomRange((r) => ({ ...r, from: e.target.value }))
              }
              aria-label="From date"
              className="min-h-touch flex-1 rounded-2xl border border-hairline bg-card px-3 text-sm text-foreground shadow-soft focus-visible:border-ring/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/15"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              value={customRange.to}
              min={customRange.from}
              onChange={(e) =>
                setCustomRange((r) => ({ ...r, to: e.target.value }))
              }
              aria-label="To date"
              className="min-h-touch flex-1 rounded-2xl border border-hairline bg-card px-3 text-sm text-foreground shadow-soft focus-visible:border-ring/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/15"
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            haptic("light");
            setScopeOpen(true);
          }}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold shadow-soft transition-colors",
            scope
              ? "border-primary/40 bg-accent text-accent-foreground"
              : "border-hairline bg-card text-muted-foreground hover:bg-secondary",
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <ListFilter className="h-4 w-4 shrink-0" />
            <span className="truncate">{scopeLabel ?? "All activity"}</span>
          </span>
          {scope ? (
            <X
              className="h-4 w-4 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                haptic("light");
                setScope(null);
              }}
            />
          ) : (
            <span className="text-xs text-muted-foreground">Filter</span>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-6 p-4 pb-nav">
            {/* Overview cards */}
            <section>
              <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Overview
              </h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {overview.map((o) => {
                  const Icon = o.icon;
                  return (
                    <div
                      key={o.label}
                      className="rounded-2xl border border-hairline bg-card p-3 shadow-soft"
                    >
                      <Icon className={cn("h-4 w-4", o.tone)} />
                      <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">
                        {o.value.toLocaleString()}
                      </p>
                      <p className="text-xs font-medium text-muted-foreground">
                        {o.label}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Daily activity chart */}
            <section className="rounded-2xl border border-hairline bg-card p-4 shadow-soft">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">
                  Daily activity
                </h2>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {SERIES.map((s) => (
                    <span
                      key={s.key}
                      className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground"
                    >
                      <span className={cn("h-2.5 w-2.5 rounded-sm", s.cls)} />
                      {s.label}
                    </span>
                  ))}
                </div>
              </div>
              <StackedBars rows={daily} />
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <RangeStat label="Messages" value={rangeTotals.sent} />
                <RangeStat label="Calls" value={rangeTotals.calls} />
                <RangeStat label="Contacts" value={rangeTotals.contacts} />
              </div>
            </section>

            {/* Breakdowns */}
            <section>
              <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Messages sent by campaign
              </h2>
              <div className="rounded-2xl border border-hairline bg-card p-4 shadow-soft">
                <BreakdownList items={byCampaign} cls="bg-amber-400" />
              </div>
            </section>

            <section>
              <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Messages sent by template
              </h2>
              <div className="rounded-2xl border border-hairline bg-card p-4 shadow-soft">
                <BreakdownList items={byTemplate} cls="bg-sky-400" />
              </div>
            </section>

            <section>
              <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Calls by outcome
              </h2>
              <div className="rounded-2xl border border-hairline bg-card p-4 shadow-soft">
                <BreakdownList items={byOutcome} cls="bg-primary" />
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Scope filter sheet */}
      <Sheet
        open={scopeOpen}
        onClose={() => setScopeOpen(false)}
        title="Filter analytics"
        description="Focus the message metrics on one campaign or template."
      >
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => {
              haptic("light");
              setScope(null);
              setScopeOpen(false);
            }}
            className={cn(
              "flex w-full items-center justify-between rounded-2xl border p-3 text-left shadow-soft transition-all active:scale-[0.99]",
              scope === null
                ? "border-primary/40 bg-accent ring-1 ring-primary/20"
                : "border-hairline bg-card hover:bg-secondary",
            )}
          >
            <span className="font-semibold text-foreground">All activity</span>
            {scope === null && <Check className="h-5 w-5 text-primary" />}
          </button>

          {campaigns.length > 0 && (
            <div className="space-y-2">
              <p className="px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                By campaign
              </p>
              {campaigns.map((c) => {
                const active = scope?.kind === "campaign" && scope.id === c.id;
                return (
                  <ScopeOption
                    key={c.id}
                    icon={Megaphone}
                    label={c.name}
                    active={active}
                    onClick={() => {
                      haptic("light");
                      setScope({ kind: "campaign", id: c.id });
                      setScopeOpen(false);
                    }}
                  />
                );
              })}
            </div>
          )}

          {templates.length > 0 && (
            <div className="space-y-2">
              <p className="px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                By template
              </p>
              {templates.map((t) => {
                const active = scope?.kind === "template" && scope.id === t.id;
                return (
                  <ScopeOption
                    key={t.id}
                    icon={LayoutTemplate}
                    label={t.name}
                    active={active}
                    onClick={() => {
                      haptic("light");
                      setScope({ kind: "template", id: t.id });
                      setScopeOpen(false);
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </Sheet>
    </div>
  );
}

function RangeStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-elevated px-2 py-2 ring-1 ring-inset ring-hairline">
      <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function StackedBars({
  rows,
}: {
  rows: { day: number; values: Record<string, number> }[];
}) {
  const max = Math.max(
    1,
    ...rows.map((r) => SERIES.reduce((s, k) => s + (r.values[k.key] ?? 0), 0)),
  );
  const hasAny = rows.some((r) =>
    SERIES.some((k) => (r.values[k.key] ?? 0) > 0),
  );
  if (!hasAny) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No activity in this range yet.
      </p>
    );
  }
  return (
    <>
      <div className="no-scrollbar flex h-32 items-end gap-[2px] overflow-x-auto">
        {rows.map((r) => {
          const total = SERIES.reduce((s, k) => s + (r.values[k.key] ?? 0), 0);
          return (
            <div
              key={r.day}
              title={`${dayShortLabel(r.day)}: ${total}`}
              className="flex h-full min-w-[5px] flex-1 flex-col-reverse overflow-hidden rounded-sm"
            >
              {SERIES.map((k) => {
                const v = r.values[k.key] ?? 0;
                if (!v) return null;
                return (
                  <div
                    key={k.key}
                    className={cn("w-full", k.cls)}
                    style={{ height: `${(v / max) * 100}%` }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{rows.length ? dayShortLabel(rows[0]!.day) : ""}</span>
        <span>
          {rows.length ? dayShortLabel(rows[rows.length - 1]!.day) : ""}
        </span>
      </div>
    </>
  );
}

function BreakdownList({
  items,
  cls = "bg-primary",
}: {
  items: { label: string; value: number }[];
  cls?: string;
}) {
  if (!items.length || items.every((i) => i.value === 0)) {
    return <p className="text-sm text-muted-foreground">Nothing yet.</p>;
  }
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.label}>
          <div className="mb-1 flex items-center justify-between gap-2 text-sm">
            <span className="truncate font-medium text-foreground">{i.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-foreground">
              {i.value}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className={cn("h-full rounded-full", cls)}
              style={{ width: `${(i.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ScopeOption({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left shadow-soft transition-all active:scale-[0.99]",
        active
          ? "border-primary/40 bg-accent ring-1 ring-primary/20"
          : "border-hairline bg-card hover:bg-secondary",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-semibold text-foreground">{label}</span>
      </span>
      {active && <Check className="h-5 w-5 shrink-0 text-primary" />}
    </button>
  );
}

