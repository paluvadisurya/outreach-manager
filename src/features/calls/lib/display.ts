import type { CallEntry, CallOutcome } from "@/lib/types";

/** Badge presentation for each call outcome. */
export const OUTCOME_META: Record<
  CallOutcome,
  { label: string; variant: "default" | "secondary" | "success" | "destructive" }
> = {
  pending: { label: "To call", variant: "secondary" },
  called: { label: "Called", variant: "success" },
  no_answer: { label: "No answer", variant: "default" },
  skipped: { label: "Skipped", variant: "secondary" },
};

/** Short, friendly date+time, e.g. "Mon 8 Jun, 10:30 AM". */
export function formatCallTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export type UpcomingBucket =
  | "Overdue"
  | "Today"
  | "Tomorrow"
  | "This week"
  | "Later";

const BUCKET_ORDER: UpcomingBucket[] = [
  "Overdue",
  "Today",
  "Tomorrow",
  "This week",
  "Later",
];

/** Local midnight (epoch ms) for the day containing `d` — the canonical day key. */
export function startOfDay(d: Date | number): number {
  const date = typeof d === "number" ? new Date(d) : d;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Group scheduled call entries by the local day they fall on, keyed by that
 * day's midnight (epoch ms). Powers the month-grid calendar's per-day markers.
 */
export function callsByDay(entries: CallEntry[]): Map<number, CallEntry[]> {
  const map = new Map<number, CallEntry[]>();
  for (const e of entries) {
    if (!e.nextCallAt) continue;
    const key = startOfDay(e.nextCallAt);
    const list = map.get(key) ?? [];
    list.push(e);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.nextCallAt ?? 0) - (b.nextCallAt ?? 0));
  }
  return map;
}

/** Short day label for a selected calendar day, e.g. "Monday, 8 Jun". */
export function formatDayLabel(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

/** Time-only label for a scheduled call, e.g. "10:30 AM". */
export function formatTimeOnly(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Classify a scheduled time relative to now into an agenda bucket. */
export function bucketFor(ms: number, now: number = Date.now()): UpcomingBucket {
  const today = startOfDay(new Date(now));
  const oneDay = 86_400_000;
  if (ms < now) return "Overdue";
  if (ms < today + oneDay) return "Today";
  if (ms < today + 2 * oneDay) return "Tomorrow";
  if (ms < today + 7 * oneDay) return "This week";
  return "Later";
}

/**
 * Group scheduled call entries into ordered agenda buckets. Entries without a
 * `nextCallAt` are ignored. Each bucket's entries are sorted soonest-first.
 */
export function groupUpcoming(
  entries: CallEntry[],
  now: number = Date.now(),
): { bucket: UpcomingBucket; entries: CallEntry[] }[] {
  const map = new Map<UpcomingBucket, CallEntry[]>();
  for (const e of entries) {
    if (!e.nextCallAt) continue;
    const bucket = bucketFor(e.nextCallAt, now);
    const list = map.get(bucket) ?? [];
    list.push(e);
    map.set(bucket, list);
  }
  return BUCKET_ORDER.filter((b) => map.has(b)).map((bucket) => ({
    bucket,
    entries: map
      .get(bucket)!
      .sort((a, b) => (a.nextCallAt ?? 0) - (b.nextCallAt ?? 0)),
  }));
}
