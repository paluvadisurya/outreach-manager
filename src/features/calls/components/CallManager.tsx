"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { haptic } from "@/lib/haptics";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { CallEntry, Contact } from "@/lib/types";
import { contactsRepo } from "@/features/contacts/lib/repository";
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
  const calls = useLiveQuery(() => callsRepo.list(), []);
  const contacts = useLiveQuery(() => contactsRepo.all(), []);

  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<CallSort>("recent");
  const [sortOpen, setSortOpen] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [openContactId, setOpenContactId] = React.useState<string | null>(null);

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
    const list = calls ?? [];
    if (!q) return list;
    return list.filter((e) =>
      contactMap.get(e.contactId)?.searchIndex.includes(q),
    );
  }, [calls, contactMap, query]);

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
        `Remove ${ids.length} contact${ids.length === 1 ? "" : "s"} from your call list? Their contact details stay — you can add them back anytime.`,
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

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        ) : (calls?.length ?? 0) === 0 ? (
          <EmptyState
            icon={Phone}
            title="Build your call list"
            description="Add contacts from a category, search for people, or pull everyone from a campaign — then track calls and schedule follow-ups."
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
            description={`Nothing on your call list matched “${query}”.`}
          />
        ) : (
          <ul className="space-y-2 p-4 pb-nav">
            {sorted.map((e) => {
              const meta = OUTCOME_META[e.outcome];
              const sel = picked.has(e.contactId);
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
                      "flex w-full cursor-pointer items-center gap-3 rounded-2xl border bg-card p-3 text-left shadow-soft transition-all hover:shadow-card active:scale-[0.99]",
                      sel
                        ? "border-primary/40 ring-1 ring-primary/25"
                        : "border-hairline",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold",
                        selectMode && sel
                          ? "bg-primary text-primary-foreground"
                          : "bg-accent text-accent-foreground",
                      )}
                    >
                      {selectMode && sel ? (
                        <CheckSquare className="h-5 w-5" />
                      ) : (
                        initials(nameFor(e))
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-foreground">
                        {nameFor(e)}
                      </span>
                      <span className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="truncate">{phoneFor(e)}</span>
                        {e.campaignIds.length > 0 && (
                          <span className="shrink-0">
                            · {e.campaignIds.length} campaign
                            {e.campaignIds.length === 1 ? "" : "s"}
                          </span>
                        )}
                      </span>
                      {e.nextCallAt && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-foreground">
                          <CalendarClock className="h-3 w-3" />
                          {formatCallTime(e.nextCallAt)}
                        </span>
                      )}
                    </span>
                    {selectMode ? (
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                          sel
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border",
                        )}
                      >
                        {sel && <CheckSquare className="h-3.5 w-3.5" />}
                      </span>
                    ) : (
                      <>
                        {/* One-tap dial, left of the status badge (Req 4). */}
                        {phoneFor(e) && (
                          <a
                            href={`tel:${phoneFor(e)}`}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              haptic("medium");
                            }}
                            aria-label={`Call ${nameFor(e)}`}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/20"
                          >
                            <Phone className="h-5 w-5" />
                          </a>
                        )}
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </>
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
              <Button
                size="sm"
                disabled={picked.size === 0}
                onClick={() => {
                  haptic("light");
                  setCampaignOpen(true);
                }}
              >
                <Send className="h-4 w-4" />
                Campaign
              </Button>
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
                Takes them off this list only. Contact details and groups stay —
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
