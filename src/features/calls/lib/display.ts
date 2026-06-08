import type { CallEntry, CallOutcome, ContactRating } from "@/lib/types";

/**
 * Presentation for the persistent traffic-light rating, shared by the detail
 * sheet's selectable buttons and the call-list row dot. `dot` colours the list
 * indicator; `idle` is the resting button; `active` is the chosen button — a
 * soft tint (not a full-saturation "neon" fill) so it reads as selected without
 * glare. Class tokens only — components attach their own icons.
 */
export const RATING_META: Record<
  ContactRating,
  { label: string; dot: string; idle: string; active: string }
> = {
  connect: {
    label: "Connect again",
    dot: "bg-green-500",
    idle: "border-green-200 bg-green-50 text-green-700",
    active: "border-green-300 bg-green-100 text-green-800 ring-1 ring-green-300",
  },
  no_answer: {
    label: "Didn't pick",
    dot: "bg-amber-500",
    idle: "border-amber-200 bg-amber-50 text-amber-700",
    active: "border-amber-300 bg-amber-100 text-amber-800 ring-1 ring-amber-300",
  },
  avoid: {
    label: "Don't call again",
    dot: "bg-red-500",
    idle: "border-red-200 bg-red-50 text-red-700",
    active: "border-red-300 bg-red-100 text-red-800 ring-1 ring-red-300",
  },
};

/** Ratings in display order (green → amber → red). */
export const RATING_ORDER: ContactRating[] = ["connect", "no_answer", "avoid"];

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

/** Ways the call list can be ordered, exposed in the sort menu. */
export type CallSort = "recent" | "upcoming" | "logged" | "name" | "added";

/** Sort options in menu order, with their user-facing labels. */
export const CALL_SORTS: { value: CallSort; label: string; hint: string }[] = [
  { value: "recent", label: "Recent activity", hint: "Latest change first" },
  { value: "upcoming", label: "Upcoming call", hint: "Soonest scheduled first" },
  { value: "logged", label: "Last call logged", hint: "Most recent outcome first" },
  { value: "name", label: "Name (A-Z)", hint: "Alphabetical" },
  { value: "added", label: "Recently added", hint: "Newest on the list first" },
];

/**
 * Return a new, sorted copy of the call entries for the chosen ordering.
 * `nameOf` resolves a contact's display name for the alphabetical sort. The
 * input array is never mutated.
 */
export function sortCalls(
  entries: CallEntry[],
  sort: CallSort,
  nameOf: (e: CallEntry) => string,
): CallEntry[] {
  const list = [...entries];
  switch (sort) {
    case "upcoming":
      // Scheduled calls soonest-first; unscheduled entries sink to the bottom,
      // ordered by recent activity among themselves.
      return list.sort((a, b) => {
        const an = a.nextCallAt ?? Infinity;
        const bn = b.nextCallAt ?? Infinity;
        if (an !== bn) return an - bn;
        return b.updatedAt - a.updatedAt;
      });
    case "logged":
      // Most recently logged outcome first; never-logged entries fall last.
      return list.sort((a, b) => (b.lastOutcomeAt ?? 0) - (a.lastOutcomeAt ?? 0));
    case "name":
      return list.sort((a, b) =>
        nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: "base" }),
      );
    case "added":
      return list.sort((a, b) => b.createdAt - a.createdAt);
    case "recent":
    default:
      return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }
}

/**
 * Recompute an entry's derived state from its history alone — the single source
 * of truth after a log is edited or deleted. `attempts` counts only real call
 * attempts (`called`/`no_answer`); the current `outcome` and `lastOutcomeAt`
 * mirror the latest log, falling back to `pending` when the history is empty.
 */
export function recomputeFromHistory(history: CallEntry["history"]): {
  outcome: CallOutcome;
  attempts: number;
  lastOutcomeAt: number | undefined;
} {
  const attempts = history.filter(
    (h) => h.outcome === "called" || h.outcome === "no_answer",
  ).length;
  const last = history[history.length - 1];
  return {
    outcome: last?.outcome ?? "pending",
    attempts,
    lastOutcomeAt: last?.at,
  };
}

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
