"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CallEntry } from "@/lib/types";
import { callsByDay, startOfDay } from "../lib/display";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

interface CalendarMonthProps {
  /** Entries that carry a `nextCallAt` — used to mark days with scheduled calls. */
  entries: CallEntry[];
  /** Currently selected day (local midnight ms), or null for "no day selected". */
  selectedDay: number | null;
  onSelectDay: (day: number | null) => void;
}

/**
 * A tappable month-grid calendar for the Call agenda. Days that have scheduled
 * calls show a marker (overdue days in red); tapping a day selects it so the
 * agenda below can show just that day's calls. Shares its data with the agenda
 * list via the same `entries` array.
 */
export function CalendarMonth({
  entries,
  selectedDay,
  onSelectDay,
}: CalendarMonthProps) {
  const today = startOfDay(new Date());

  // The month being viewed, anchored to the 1st. Starts on the selected day's
  // month (or this month) and is navigable with the chevrons.
  const [viewMonth, setViewMonth] = React.useState(() => {
    const base = selectedDay ? new Date(selectedDay) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const byDay = React.useMemo(() => callsByDay(entries), [entries]);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Build a padded grid: leading blanks for the first week, then each day.
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const monthLabel = viewMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const shiftMonth = (delta: number) =>
    setViewMonth(new Date(year, month + delta, 1));

  const goToday = () => {
    setViewMonth(new Date());
    onSelectDay(today);
  };

  return (
    <div className="rounded-3xl border border-hairline bg-card p-4 shadow-card">
      {/* Month header */}
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="Previous month"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={goToday}
          className="rounded-full px-3 py-1 text-sm font-bold text-foreground hover:bg-secondary"
        >
          {monthLabel}
        </button>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Weekday labels */}
      <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="py-1">
            {w}
          </span>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <span key={`pad-${i}`} />;
          const dayMs = new Date(year, month, day).getTime();
          const count = byDay.get(dayMs)?.length ?? 0;
          const isToday = dayMs === today;
          const isSelected = selectedDay === dayMs;
          const isOverdue = count > 0 && dayMs < today;

          return (
            <button
              key={dayMs}
              type="button"
              onClick={() => onSelectDay(isSelected ? null : dayMs)}
              aria-label={`${day}${count ? `, ${count} call${count === 1 ? "" : "s"}` : ""}`}
              aria-pressed={isSelected}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm font-medium transition-colors",
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : isToday
                    ? "bg-accent text-accent-foreground ring-1 ring-primary/30"
                    : "text-foreground hover:bg-secondary",
              )}
            >
              <span className="tabular-nums">{day}</span>
              {count > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 h-1.5 w-1.5 rounded-full",
                    isSelected
                      ? "bg-primary-foreground"
                      : isOverdue
                        ? "bg-destructive"
                        : "bg-primary",
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
