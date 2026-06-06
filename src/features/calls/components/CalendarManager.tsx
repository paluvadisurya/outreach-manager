"use client";

import * as React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Phone,
  CalendarPlus,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
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

  const contactMap = React.useMemo(() => {
    const map = new Map<string, Contact>();
    for (const c of contacts ?? []) map.set(c.id, c);
    return map;
  }, [contacts]);

  const scheduled = React.useMemo(
    () => (calls ?? []).filter((e) => e.nextCallAt),
    [calls],
  );
  const upcoming = React.useMemo(() => groupUpcoming(scheduled), [scheduled]);

  const dayEntries = React.useMemo(() => {
    if (selectedDay === null) return [];
    return scheduled
      .filter((e) => startOfDay(e.nextCallAt!) === selectedDay)
      .sort((a, b) => (a.nextCallAt ?? 0) - (b.nextCallAt ?? 0));
  }, [scheduled, selectedDay]);

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
          calls ? `${scheduled.length} scheduled call${scheduled.length === 1 ? "" : "s"}` : undefined
        }
      />

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
                Month view
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
                      onOpen={() => setOpenContactId(e.contactId)}
                      onCalendar={() => addToCalendar(e)}
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
                      onOpen={() => setOpenContactId(e.contactId)}
                      onCalendar={() => addToCalendar(e)}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>

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
}: {
  entry: CallEntry;
  name: string;
  phone: string;
  timeLabel: string;
  onOpen: () => void;
  onCalendar: () => void;
}) {
  return (
    <li className="rounded-2xl border border-border/70 bg-card/80 p-3 shadow-soft">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 text-left"
      >
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
      <div className="mt-2 flex gap-2">
        <a href={`tel:${phone}`} className="flex-1">
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
    </li>
  );
}
