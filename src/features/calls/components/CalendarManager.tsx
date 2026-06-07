"use client";

import * as React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Phone,
  CalendarPlus,
  CalendarClock,
  CalendarDays,
  CalendarX,
  ChevronDown,
  ChevronRight,
  Search,
  X,
  CheckSquare,
  CheckCheck,
  UserMinus,
  Check,
} from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import type { CallEntry, Contact } from "@/lib/types";
import { contactsRepo } from "@/features/contacts/lib/repository";
import { callsRepo } from "../lib/repository";
import {
  formatCallTime,
  formatDayLabel,
  formatTimeOnly,
  groupUpcoming,
  startOfDay,
} from "../lib/display";
import { downloadICS } from "../lib/ics";
import { CallDetailSheet } from "./CallDetailSheet";
import { CalendarMonth } from "./CalendarMonth";

/**
 * The Calendar surface — its own bottom-nav destination. Shows a minimize-able
 * month grid and a full agenda of every scheduled call (overdue, today, upcoming),
 * with quick Call + add-to-device-calendar actions. Tapping a row opens the call
 * detail sheet so the user can reschedule or log an outcome.
 */
export function CalendarManager() {
  const calls = useLiveQuery(() => callsRepo.list(), []);
  const contacts = useLiveQuery(() => contactsRepo.all(), []);

  const [openContactId, setOpenContactId] = React.useState<string | null>(null);
  const [selectedDay, setSelectedDay] = React.useState<number | null>(null);
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [selectMode, setSelectMode] = React.useState(false);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());

  const contactMap = React.useMemo(() => {
    const map = new Map<string, Contact>();
    for (const c of contacts ?? []) map.set(c.id, c);
    return map;
  }, [contacts]);

  const allScheduled = React.useMemo(
    () => (calls ?? []).filter((e) => e.nextCallAt),
    [calls],
  );
  // Search narrows the agenda lists (the month grid keeps every dot).
  const scheduled = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allScheduled;
    return allScheduled.filter((e) =>
      contactMap.get(e.contactId)?.searchIndex.includes(q),
    );
  }, [allScheduled, contactMap, query]);
  const upcoming = React.useMemo(() => groupUpcoming(scheduled), [scheduled]);

  const dayEntries = React.useMemo(() => {
    if (selectedDay === null) return [];
    return scheduled
      .filter((e) => startOfDay(e.nextCallAt!) === selectedDay)
      .sort((a, b) => (a.nextCallAt ?? 0) - (b.nextCallAt ?? 0));
  }, [scheduled, selectedDay]);

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

  const visibleIds = React.useMemo(() => scheduled.map((e) => e.contactId), [scheduled]);
  const allPicked =
    visibleIds.length > 0 && visibleIds.every((id) => picked.has(id));

  const toggleAll = () => {
    haptic("light");
    setPicked((prev) => {
      const all = visibleIds.every((id) => prev.has(id));
      const next = new Set(prev);
      for (const id of visibleIds) {
        if (all) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const unschedulePicked = async () => {
    const ids = [...picked];
    if (!ids.length) return;
    haptic("light");
    await Promise.all(ids.map((id) => callsRepo.clearNext(id)));
    exitSelect();
  };

  const removePicked = async () => {
    const ids = [...picked];
    if (!ids.length) return;
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
    exitSelect();
  };

  const onRowOpen = (contactId: string) => {
    if (selectMode) togglePick(contactId);
    else setOpenContactId(contactId);
  };

  const nameFor = (e: CallEntry) => {
    const c = contactMap.get(e.contactId);
    return c?.fullName || c?.phone || e.contactId;
  };
  const phoneFor = (e: CallEntry) => contactMap.get(e.contactId)?.phone ?? "";

  const addToCalendar = (e: CallEntry) => {
    if (!e.nextCallAt) return;
    downloadICS({
      title: `Call ${nameFor(e)}`,
      start: new Date(e.nextCallAt),
      description: e.nextCallNote || phoneFor(e),
    });
  };

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader
        title="Calendar"
        icon={CalendarDays}
        subtitle={
          calls ? `${allScheduled.length} scheduled call${allScheduled.length === 1 ? "" : "s"}` : undefined
        }
      />

      {/* Search + select */}
      {allScheduled.length > 0 && (
        <div className="border-b border-border/60 px-5 pb-3 pt-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search scheduled calls…"
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
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-4 p-4 pb-nav">
          <div>
            <button
              type="button"
              onClick={() =>
                setCalendarOpen((open) => {
                  if (open) setSelectedDay(null);
                  return !open;
                })
              }
              aria-expanded={calendarOpen}
              className="flex w-full items-center justify-between rounded-2xl border border-border/70 bg-card/80 px-4 py-3 shadow-soft transition-colors hover:bg-secondary/40"
            >
              <span className="flex items-center gap-2 font-semibold text-foreground">
                <CalendarDays className="h-5 w-5 text-muted-foreground" />
                View calendar
              </span>
              <ChevronDown
                className={cn(
                  "h-5 w-5 text-muted-foreground transition-transform",
                  calendarOpen && "rotate-180",
                )}
              />
            </button>
            {calendarOpen && (
              <div className="mt-3">
                <CalendarMonth
                  entries={scheduled}
                  selectedDay={selectedDay}
                  onSelectDay={setSelectedDay}
                />
              </div>
            )}
          </div>

          {calendarOpen && selectedDay !== null ? (
            <section>
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {formatDayLabel(selectedDay)}
                </h2>
                <button
                  type="button"
                  onClick={() => setSelectedDay(null)}
                  className="text-xs font-semibold text-primary"
                >
                  Show all
                </button>
              </div>
              {dayEntries.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
                  No calls scheduled for this day.
                </p>
              ) : (
                <ul className="space-y-2">
                  {dayEntries.map((e) => (
                    <AgendaRow
                      key={e.id}
                      entry={e}
                      name={nameFor(e)}
                      phone={phoneFor(e)}
                      timeLabel={e.nextCallAt ? formatTimeOnly(e.nextCallAt) : ""}
                      onOpen={() => onRowOpen(e.contactId)}
                      onCalendar={() => addToCalendar(e)}
                      selectMode={selectMode}
                      selected={picked.has(e.contactId)}
                    />
                  ))}
                </ul>
              )}
            </section>
          ) : upcoming.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No calls scheduled"
              description="Open a contact from the Call list and schedule the next call, or tap a day above to plan one."
            />
          ) : (
            upcoming.map(({ bucket, entries }) => (
              <section key={bucket}>
                <h2
                  className={cn(
                    "mb-2 px-1 text-xs font-bold uppercase tracking-wide",
                    bucket === "Overdue"
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {bucket}
                </h2>
                <ul className="space-y-2">
                  {entries.map((e) => (
                    <AgendaRow
                      key={e.id}
                      entry={e}
                      name={nameFor(e)}
                      phone={phoneFor(e)}
                      timeLabel={e.nextCallAt ? formatCallTime(e.nextCallAt) : ""}
                      onOpen={() => onRowOpen(e.contactId)}
                      onCalendar={() => addToCalendar(e)}
                      selectMode={selectMode}
                      selected={picked.has(e.contactId)}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>

      {/* Selection action bar — floats above the bottom nav. */}
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
                disabled={scheduled.length === 0}
                aria-label={allPicked ? "Deselect all" : "Select all"}
              >
                <CheckCheck className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={unschedulePicked}
                disabled={picked.size === 0}
                aria-label="Clear scheduled call"
              >
                <CalendarX className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={removePicked}
                disabled={picked.size === 0}
                aria-label="Remove contacts"
              >
                <UserMinus className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <CallDetailSheet
        contactId={openContactId}
        onClose={() => setOpenContactId(null)}
      />
    </div>
  );
}

/** A single agenda row with Call + Calendar quick actions. */
function AgendaRow({
  entry,
  name,
  phone,
  timeLabel,
  onOpen,
  onCalendar,
  selectMode = false,
  selected = false,
}: {
  entry: CallEntry;
  name: string;
  phone: string;
  timeLabel: string;
  onOpen: () => void;
  onCalendar: () => void;
  selectMode?: boolean;
  selected?: boolean;
}) {
  return (
    <li
      className={cn(
        "rounded-2xl border bg-card/80 p-3 shadow-soft transition-colors",
        selected ? "border-primary/50 ring-1 ring-primary/30" : "border-border/70",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 text-left"
      >
        {selectMode && (
          <span
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-transparent",
            )}
          >
            <Check className="h-3.5 w-3.5" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-foreground">
            {name}
          </span>
          <span className="block text-sm text-muted-foreground">{timeLabel}</span>
          {entry.nextCallNote && (
            <span className="mt-0.5 block truncate text-sm text-foreground">
              {entry.nextCallNote}
            </span>
          )}
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      </button>
      {!selectMode && (
        <div className="mt-2 flex gap-2">
          <a href={`tel:${phone}`} className="flex-1" onClick={() => haptic("light")}>
            <Button size="sm" className="w-full">
              <Phone className="h-4 w-4" />
              Call
            </Button>
          </a>
          <Button size="sm" variant="outline" onClick={onCalendar}>
            <CalendarPlus className="h-4 w-4" />
            Calendar
          </Button>
        </div>
      )}
    </li>
  );
}
