import type { AppEvent } from "@/lib/types";

/**
 * Pure analytics helpers. Everything the Analytics dashboard renders is computed
 * here from plain arrays (events, contacts, calls, messages) so the logic is
 * testable in isolation and the component stays a thin view.
 */

const ONE_DAY = 86_400_000;

/** Local midnight (epoch ms) for the day containing `ms` — the canonical day key. */
export function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Inclusive list of day-midnight keys spanning `from`..`to`. Iterates by calendar
 * day (not a fixed ms step) so daylight-saving transitions never drop or double a
 * day.
 */
export function dayKeys(from: number, to: number): number[] {
  const out: number[] = [];
  const cur = new Date(startOfDay(from));
  const end = startOfDay(to);
  while (cur.getTime() <= end) {
    out.push(cur.getTime());
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export interface DayCount {
  day: number;
  count: number;
}

/**
 * Zero-filled per-day counts across [from, to] from a list of timestamps.
 * Timestamps outside the range are ignored. The result always covers every day
 * in the range (so a bar chart shows gaps as empty days, not missing bars).
 */
export function tallyByDay(
  timestamps: number[],
  from: number,
  to: number,
): DayCount[] {
  const keys = dayKeys(from, to);
  const counts = new Map<number, number>(keys.map((k) => [k, 0]));
  for (const ts of timestamps) {
    const k = startOfDay(ts);
    if (counts.has(k)) counts.set(k, counts.get(k)! + 1);
  }
  return keys.map((day) => ({ day, count: counts.get(day) ?? 0 }));
}

/** Count items by a string key, skipping null/empty keys. */
export function tallyByKey<T>(
  items: T[],
  keyFn: (item: T) => string | null | undefined,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const k = keyFn(item);
    if (!k) continue;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

/** A named date-range preset, resolved to a concrete [from, to] window. */
export type RangePreset = "7d" | "30d" | "90d" | "all" | "custom";

export interface DateRange {
  from: number;
  to: number;
}

/**
 * Resolve a preset into a [from, to] window ending now. `all` falls back to the
 * earliest timestamp seen (or 90 days when there's nothing yet) so the chart has
 * a sensible left edge. `custom` uses the caller-supplied window; until one is
 * chosen it behaves like `all`.
 */
export function resolveRange(
  preset: RangePreset,
  now: number = Date.now(),
  earliest?: number,
  custom?: DateRange,
): DateRange {
  const to = now;
  switch (preset) {
    case "7d":
      return { from: startOfDay(now - 6 * ONE_DAY), to };
    case "30d":
      return { from: startOfDay(now - 29 * ONE_DAY), to };
    case "90d":
      return { from: startOfDay(now - 89 * ONE_DAY), to };
    case "custom":
      if (custom) return { from: startOfDay(custom.from), to: custom.to };
      return { from: startOfDay(earliest ?? now - 89 * ONE_DAY), to };
    case "all":
    default:
      return {
        from: startOfDay(earliest ?? now - 89 * ONE_DAY),
        to,
      };
  }
}

/** Keep only events whose `at` falls within [range.from, range.to]. */
export function eventsInRange(events: AppEvent[], range: DateRange): AppEvent[] {
  return events.filter((e) => e.at >= range.from && e.at <= range.to);
}

/** Short axis label for a day key, e.g. "8 Jun". */
export function dayShortLabel(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

/**
 * Combine several per-day series (already aligned to the same day keys) into one
 * array of rows keyed by day, for a grouped/stacked bar chart. Each input series
 * must share the same day keys (use `tallyByDay` over the same range).
 */
export function mergeDaySeries(
  series: Record<string, DayCount[]>,
): { day: number; values: Record<string, number> }[] {
  const keys = Object.keys(series);
  const first = keys.length ? series[keys[0]!]! : [];
  return first.map((_, i) => {
    const day = first[i]!.day;
    const values: Record<string, number> = {};
    for (const name of keys) values[name] = series[name]![i]?.count ?? 0;
    return { day, values };
  });
}
