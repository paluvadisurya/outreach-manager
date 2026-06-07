"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Phone,
  Plus,
  Search,
  X,
  CalendarClock,
  CheckSquare,
  CheckCheck,
  UserMinus,
  ListX,
  UserX,
  Send,
  ArrowUpDown,
  Check,
  ListFilter,
  Megaphone,
  LayoutTemplate,
  CheckCircle2,
  History,
} from "lucide-react";
import { haptic } from "@/lib/haptics";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { HapticButton } from "@/components/ui/haptic-button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { CallEntry, Contact } from "@/lib/types";
import { contactsRepo } from "@/features/contacts/lib/repository";
import { campaignsRepo } from "@/features/campaigns/lib/repository";
import { templatesRepo } from "@/features/templates/lib/repository";
import { CampaignCreateSheet } from "@/features/campaigns/components/CampaignCreateSheet";
import { callsRepo } from "../lib/repository";
import {
  OUTCOME_META,
  formatCallTime,
  sortCalls,
  CALL_SORTS,
  type CallSort,
} from "../lib/display";
import { AddToCallSheet } from "./AddToCallSheet";
import { CallDetailSheet } from "./CallDetailSheet";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function CallManager() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const calls = useLiveQuery(() => callsRepo.list(), []);
  const contacts = useLiveQuery(() => contactsRepo.all(), []);
  const campaigns = useLiveQuery(() => campaignsRepo.all(), []) ?? [];
  const templates = useLiveQuery(() => templatesRepo.all(), []) ?? [];
  // Contacts already messaged in some campaign — drives the per-row "Messaged"
  // flag and the dashboard's messaged count (Req #3/#4).
  const sentIds = useLiveQuery(() => campaignsRepo.sentContactIds(), []);

  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<CallSort>("recent");
  const [sortOpen, setSortOpen] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [openContactId, setOpenContactId] = React.useState<string | null>(null);
  // Dashboard filter (Req #3): narrow the list + stats to one campaign or
  // template. At most one active filter at a time.
  const [filter, setFilter] = React.useState<
    { kind: "campaign" | "template"; id: string } | null
  >(null);
  const [filterOpen, setFilterOpen] = React.useState(false);

  // Deep link from the campaign screen (Req #2): open a person's call detail.
  const focusContactId = searchParams.get("contact");
  const focusHandled = React.useRef(false);
  React.useEffect(() => {
    if (!focusHandled.current && focusContactId && calls !== undefined) {
      focusHandled.current = true;
      setOpenContactId(focusContactId);
    }
  }, [focusContactId, calls]);

  // Campaign id → the campaign, and campaign id → its template ids, for filtering.
  const campaignMap = React.useMemo(() => {
    const map = new Map<string, (typeof campaigns)[number]>();
    for (const c of campaigns) map.set(c.id, c);
    return map;
  }, [campaigns]);

  // Multi-select on the call list → create one campaign for the chosen contacts.
  const [selectMode, setSelectMode] = React.useState(false);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [campaignOpen, setCampaignOpen] = React.useState(false);
  const [removeMenuOpen, setRemoveMenuOpen] = React.useState(false);

  const contactMap = React.useMemo(() => {
    const map = new Map<string, Contact>();
    for (const c of contacts ?? []) map.set(c.id, c);
    return map;
  }, [contacts]);

  const loading = calls === undefined || contacts === undefined;

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = calls ?? [];
    if (filter) {
      list = list.filter((e) => {
        if (filter.kind === "campaign") return e.campaignIds.includes(filter.id);
        // Template filter: any linked campaign renders from this template.
        return e.campaignIds.some((cid) =>
          campaignMap.get(cid)?.templateIds.includes(filter.id),
        );
      });
    }
    if (q) {
      list = list.filter((e) =>
        contactMap.get(e.contactId)?.searchIndex.includes(q),
      );
    }
    return list;
  }, [calls, contactMap, campaignMap, query, filter]);

  const nameFor = (e: CallEntry) => {
    const c = contactMap.get(e.contactId);
    return c?.fullName || c?.phone || e.contactId;
  };
  const phoneFor = (e: CallEntry) => contactMap.get(e.contactId)?.phone ?? "";

  const sorted = React.useMemo(
    () => sortCalls(filtered, sort, nameFor),
    // nameFor reads contactMap; recompute when either the list or names change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, sort, contactMap],
  );

  // High-level dashboard stats over the currently-filtered list (Req #3).
  const stats = React.useMemo(() => {
    let toCall = 0,
      called = 0,
      noAnswer = 0,
      scheduled = 0,
      attempts = 0,
      messaged = 0;
    for (const e of filtered) {
      if (e.outcome === "pending") toCall++;
      else if (e.outcome === "called") called++;
      else if (e.outcome === "no_answer") noAnswer++;
      if (e.nextCallAt) scheduled++;
      attempts += e.attempts;
      if (sentIds?.has(e.contactId)) messaged++;
    }
    return {
      total: filtered.length,
      toCall,
      called,
      noAnswer,
      scheduled,
      attempts,
      messaged,
    };
  }, [filtered, sentIds]);

  const filterLabel = filter
    ? filter.kind === "campaign"
      ? (campaignMap.get(filter.id)?.name ?? "Campaign")
      : (templates.find((t) => t.id === filter.id)?.name ?? "Template")
    : null;

  const exitSelect = React.useCallback(() => {
    setSelectMode(false);
    setPicked(new Set());
  }, []);

  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const filteredIds = React.useMemo(
    () => sorted.map((e) => e.contactId),
    [sorted],
  );
  const allPicked =
    filteredIds.length > 0 && filteredIds.every((id) => picked.has(id));

  const toggleAll = () => {
    haptic("light");
    setPicked((prev) => {
      const all = filteredIds.every((id) => prev.has(id));
      const next = new Set(prev);
      for (const id of filteredIds) {
        if (all) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const pluralPicked = picked.size === 1 ? "" : "s";

  // Drop the picked contacts from the call list only — their contact records and
  // group memberships are untouched, so they can be re-added later.
  const removeFromCallList = async () => {
    const ids = [...picked];
    if (ids.length === 0) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Remove ${ids.length} contact${ids.length === 1 ? "" : "s"} from your call list? Their contact details stay. You can add them back anytime.`,
      )
    ) {
      return;
    }
    haptic("warning");
    await Promise.all(ids.map((id) => callsRepo.remove(id)));
    setRemoveMenuOpen(false);
    exitSelect();
  };

  // Soft-remove the picked contacts entirely (no WhatsApp / out of domain).
  const removeEntirely = async () => {
    const ids = [...picked];
    if (ids.length === 0) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Remove ${ids.length} contact${ids.length === 1 ? "" : "s"} entirely? They'll be hidden everywhere and skipped on future imports. Restore from Settings → Removed contacts.`,
      )
    ) {
      return;
    }
    haptic("warning");
    await contactsRepo.remove(ids);
    setRemoveMenuOpen(false);
    exitSelect();
  };

  const onRowTap = (e: CallEntry) => {
    if (selectMode) togglePick(e.contactId);
    else setOpenContactId(e.contactId);
  };

  // After a campaign is created from the selection, link it back to those call
  // entries (so the messages surface as talking points) and open it.
  const onCampaignCreated = (id: string) => {
    const ids = [...picked];
    void callsRepo.addContacts(ids, [id]);
    exitSelect();
    router.push(`/campaigns/${id}`);
  };

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader
        title="Call"
        icon={Phone}
        subtitle={calls ? `${calls.length} on your list` : undefined}
        action={
          <Button
            size="icon"
            onClick={() => setAddOpen(true)}
            aria-label="Add contacts to call list"
          >
            <Plus className="h-5 w-5" />
          </Button>
        }
      />

      {/* Search + select */}
      <div className="border-b border-border/60 px-5 pb-3 pt-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your call list…"
              className="pl-11 pr-11"
              inputMode="search"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {(calls?.length ?? 0) > 0 && !selectMode && (
            <button
              type="button"
              onClick={() => {
                haptic("light");
                setFilterOpen(true);
              }}
              aria-label="Filter call list"
              className={cn(
                "relative flex min-h-touch shrink-0 items-center justify-center rounded-xl px-3 transition-colors",
                filter
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-foreground hover:bg-secondary/80",
              )}
            >
              <ListFilter className="h-4 w-4" />
            </button>
          )}
          {(calls?.length ?? 0) > 0 && !selectMode && (
            <button
              type="button"
              onClick={() => {
                haptic("light");
                setSortOpen(true);
              }}
              aria-label="Sort call list"
              className="flex min-h-touch shrink-0 items-center justify-center rounded-xl bg-secondary px-3 text-foreground transition-colors hover:bg-secondary/80"
            >
              <ArrowUpDown className="h-4 w-4" />
            </button>
          )}
          {(calls?.length ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
              className={cn(
                "flex min-h-touch shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors",
                selectMode
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-foreground hover:bg-secondary/80",
              )}
            >
              {selectMode ? (
                <>
                  <X className="h-4 w-4" />
                  Done
                </>
              ) : (
                <>
                  <CheckSquare className="h-4 w-4" />
                  Select
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Dashboard stats (Req #3) — reflect the active filter + search. */}
      {(calls?.length ?? 0) > 0 && !selectMode && (
        <div className="border-b border-border/60 px-4 py-2.5">
          {filter && (
            <button
              type="button"
              onClick={() => {
                haptic("light");
                setFilter(null);
              }}
              className="mb-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground ring-1 ring-primary/20"
            >
              {filter.kind === "campaign" ? (
                <Megaphone className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <LayoutTemplate className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="truncate">{filterLabel}</span>
              <X className="h-3.5 w-3.5 shrink-0" />
            </button>
          )}
          {/* A wrapping grid (not a horizontal scroller) so no stat is ever
              clipped off-screen on a narrow phone (Req: stats overflow/hidden). */}
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                { label: "To call", value: stats.toCall, tone: "text-foreground" },
                { label: "Called", value: stats.called, tone: "text-primary" },
                {
                  label: "No answer",
                  value: stats.noAnswer,
                  tone: "text-amber-600",
                },
                {
                  label: "Scheduled",
                  value: stats.scheduled,
                  tone: "text-foreground",
                },
                {
                  label: "Messaged",
                  value: stats.messaged,
                  tone: "text-primary",
                },
                {
                  label: "Attempts",
                  value: stats.attempts,
                  tone: "text-muted-foreground",
                },
              ] as { label: string; value: number; tone: string }[]
            ).map((s) => (
              <div
                key={s.label}
                className="flex flex-col items-center rounded-2xl bg-elevated px-2 py-2 ring-1 ring-inset ring-hairline"
              >
                <span className={cn("text-base font-bold tabular-nums", s.tone)}>
                  {s.value}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        ) : (calls?.length ?? 0) === 0 ? (
          <EmptyState
            icon={Phone}
            title="Build your call list"
            description="Add contacts from a category, search for people, or pull everyone from a campaign. Track calls and schedule follow-ups."
            action={
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="h-5 w-5" />
                Add contacts
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No matches"
            description={
              query
                ? `Nothing on your call list matched “${query}”.`
                : "No one on your call list matches this filter."
            }
          />
        ) : (
          <ul className="space-y-2 p-4 pb-nav">
            {sorted.map((e) => {
              const meta = OUTCOME_META[e.outcome];
              const sel = picked.has(e.contactId);
              const name = nameFor(e);
              const phone = phoneFor(e);
              const messaged = Boolean(sentIds?.has(e.contactId));
              const chip =
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium";
              return (
                <li key={e.id}>
                  {/* A div (not a button) so the tel: call link can nest legally. */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onRowTap(e)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        onRowTap(e);
                      }
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-start gap-3 rounded-2xl border bg-card p-3 text-left shadow-soft transition-all hover:shadow-card active:scale-[0.99]",
                      sel
                        ? "border-primary/40 ring-1 ring-primary/25"
                        : "border-hairline",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold",
                        selectMode && sel
                          ? "bg-primary text-primary-foreground"
                          : "bg-accent text-accent-foreground",
                      )}
                    >
                      {selectMode && sel ? (
                        <CheckSquare className="h-5 w-5" />
                      ) : (
                        initials(name)
                      )}
                    </span>

                    {/* Content — name wraps, phone gets its own line, and a stat
                        chip row carries the rest so nothing is truncated (Req #7). */}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0 font-semibold leading-snug text-foreground [overflow-wrap:anywhere]">
                          {name}
                        </span>
                        {!selectMode && (
                          <Badge variant={meta.variant} className="mt-0.5 shrink-0">
                            {meta.label}
                          </Badge>
                        )}
                      </span>
                      <span className="mt-0.5 block text-sm tabular-nums text-muted-foreground">
                        {phone}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {e.attempts > 0 && (
                          <span className={cn(chip, "bg-secondary text-muted-foreground")}>
                            {e.attempts} attempt{e.attempts === 1 ? "" : "s"}
                          </span>
                        )}
                        {e.lastOutcomeAt && (
                          <span className={cn(chip, "bg-secondary text-muted-foreground")}>
                            <History className="h-3 w-3" />
                            {formatCallTime(e.lastOutcomeAt)}
                          </span>
                        )}
                        {e.nextCallAt && (
                          <span className={cn(chip, "bg-accent text-accent-foreground ring-1 ring-primary/20")}>
                            <CalendarClock className="h-3 w-3" />
                            {formatCallTime(e.nextCallAt)}
                          </span>
                        )}
                        {e.campaignIds.length > 0 && (
                          <span className={cn(chip, "bg-secondary text-muted-foreground")}>
                            <Megaphone className="h-3 w-3" />
                            {e.campaignIds.length} campaign
                            {e.campaignIds.length === 1 ? "" : "s"}
                          </span>
                        )}
                        {messaged && (
                          <span className={cn(chip, "bg-primary/10 text-primary")}>
                            <CheckCircle2 className="h-3 w-3" />
                            Messaged
                          </span>
                        )}
                      </span>
                    </span>

                    {selectMode ? (
                      <span
                        className={cn(
                          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                          sel
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border",
                        )}
                      >
                        {sel && <CheckSquare className="h-3.5 w-3.5" />}
                      </span>
                    ) : (
                      phone && (
                        <a
                          href={`tel:${phone}`}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            haptic("medium");
                          }}
                          aria-label={`Call ${name}`}
                          className="flex h-10 w-10 shrink-0 items-center justify-center self-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/20"
                        >
                          <Phone className="h-5 w-5" />
                        </a>
                      )
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Selection action bar — floats above the bottom nav so it's always in
          reach (mirrors the Contacts explorer pattern). */}
      {selectMode && (
        <div className="fixed inset-x-0 bottom-[var(--bottom-nav-gap)] z-40 flex justify-center px-4">
          <div className="glass flex w-full max-w-md items-center gap-2 rounded-2xl border border-white/60 px-3 py-2 shadow-float animate-in slide-in-from-bottom-2">
            <button
              type="button"
              onClick={exitSelect}
              className="flex items-center gap-1.5 rounded-xl bg-secondary px-2.5 py-1.5 text-sm font-semibold text-foreground hover:bg-secondary/70"
            >
              <X className="h-4 w-4" />
              {picked.size}
            </button>
            <div className="ml-auto flex gap-1.5">
              <Button
                size="sm"
                variant={allPicked ? "secondary" : "outline"}
                onClick={toggleAll}
                disabled={filtered.length === 0}
                aria-label={allPicked ? "Deselect all" : "Select all"}
              >
                <CheckCheck className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  haptic("light");
                  setRemoveMenuOpen(true);
                }}
                disabled={picked.size === 0}
                aria-label="Remove contacts"
              >
                <UserMinus className="h-4 w-4 text-destructive" />
              </Button>
              <HapticButton
                size="sm"
                disabled={picked.size === 0}
                onClick={() => setCampaignOpen(true)}
              >
                <Send className="h-4 w-4" />
                Campaign
              </HapticButton>
            </div>
          </div>
        </div>
      )}

      {/* Two flavours of remove for the selection: drop from the call list only,
          or soft-remove the contacts everywhere (Req 3). */}
      <Sheet
        open={removeMenuOpen}
        onClose={() => setRemoveMenuOpen(false)}
        title={`Remove ${picked.size} contact${pluralPicked}`}
        description="Choose how far the removal should go."
      >
        <div className="space-y-2">
          <button
            type="button"
            onClick={removeFromCallList}
            className="flex w-full items-center gap-3 rounded-2xl border border-hairline bg-card p-3 text-left shadow-soft transition-all hover:bg-secondary active:scale-[0.99]"
          >
            <ListX className="h-5 w-5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-foreground">
                Remove from call list
              </span>
              <span className="block text-sm text-muted-foreground">
                Takes them off this list only. Contact details and groups stay,
                add them back anytime.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={removeEntirely}
            className="flex w-full items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-left transition-colors hover:bg-destructive/10"
          >
            <UserX className="h-5 w-5 shrink-0 text-destructive" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-destructive">
                Remove contact entirely
              </span>
              <span className="block text-sm text-muted-foreground">
                Hides them everywhere and skips them on future imports. Restorable
                from Settings → Removed contacts.
              </span>
            </span>
          </button>
        </div>
      </Sheet>

      {/* Choose how the call list is ordered. */}
      <Sheet
        open={sortOpen}
        onClose={() => setSortOpen(false)}
        title="Sort call list"
        description="Order your contacts the way that suits your day."
      >
        <div className="space-y-2">
          {CALL_SORTS.map((s) => {
            const active = s.value === sort;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => {
                  haptic("light");
                  setSort(s.value);
                  setSortOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl border p-3 text-left shadow-soft transition-all active:scale-[0.99]",
                  active
                    ? "border-primary/40 bg-accent ring-1 ring-primary/20"
                    : "border-hairline bg-card hover:bg-secondary",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-foreground">
                    {s.label}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {s.hint}
                  </span>
                </span>
                {active && (
                  <Check className="h-5 w-5 shrink-0 text-primary" />
                )}
              </button>
            );
          })}
        </div>
      </Sheet>

      {/* Filter the dashboard + list by a campaign or a template (Req #3). */}
      <Sheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter call list"
        description="Focus on the people tied to one campaign or template."
      >
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => {
              haptic("light");
              setFilter(null);
              setFilterOpen(false);
            }}
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left shadow-soft transition-all active:scale-[0.99]",
              filter === null
                ? "border-primary/40 bg-accent ring-1 ring-primary/20"
                : "border-hairline bg-card hover:bg-secondary",
            )}
          >
            <span className="font-semibold text-foreground">Everyone</span>
            {filter === null && <Check className="h-5 w-5 text-primary" />}
          </button>

          {campaigns.length > 0 && (
            <div className="space-y-2">
              <p className="px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                By campaign
              </p>
              {campaigns.map((c) => {
                const active = filter?.kind === "campaign" && filter.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      haptic("light");
                      setFilter({ kind: "campaign", id: c.id });
                      setFilterOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left shadow-soft transition-all active:scale-[0.99]",
                      active
                        ? "border-primary/40 bg-accent ring-1 ring-primary/20"
                        : "border-hairline bg-card hover:bg-secondary",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Megaphone className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate font-semibold text-foreground">
                        {c.name}
                      </span>
                    </span>
                    {active && <Check className="h-5 w-5 shrink-0 text-primary" />}
                  </button>
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
                const active = filter?.kind === "template" && filter.id === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      haptic("light");
                      setFilter({ kind: "template", id: t.id });
                      setFilterOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left shadow-soft transition-all active:scale-[0.99]",
                      active
                        ? "border-primary/40 bg-accent ring-1 ring-primary/20"
                        : "border-hairline bg-card hover:bg-secondary",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <LayoutTemplate className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate font-semibold text-foreground">
                        {t.name}
                      </span>
                    </span>
                    {active && <Check className="h-5 w-5 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Sheet>

      <AddToCallSheet open={addOpen} onClose={() => setAddOpen(false)} />

      <CallDetailSheet
        contactId={openContactId}
        onClose={() => setOpenContactId(null)}
      />

      <CampaignCreateSheet
        open={campaignOpen}
        onClose={() => setCampaignOpen(false)}
        onCreated={onCampaignCreated}
        contactIds={[...picked]}
      />
    </div>
  );
}
