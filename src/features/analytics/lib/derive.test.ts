import { describe, it, expect } from "vitest";
import type { AppEvent } from "@/lib/types";
import {
  startOfDay,
  dayKeys,
  tallyByDay,
  tallyByKey,
  resolveRange,
  eventsInRange,
  mergeDaySeries,
} from "./derive";

const at = (y: number, m: number, d: number, h = 12): number =>
  new Date(y, m - 1, d, h).getTime();

describe("startOfDay", () => {
  it("strips the time component to local midnight", () => {
    const noon = at(2026, 6, 7, 12);
    const result = startOfDay(noon);
    const d = new Date(result);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getDate()).toBe(7);
  });

  it("is idempotent", () => {
    const noon = at(2026, 6, 7);
    expect(startOfDay(startOfDay(noon))).toBe(startOfDay(noon));
  });
});

describe("dayKeys", () => {
  it("returns an inclusive list of day midnights", () => {
    const keys = dayKeys(at(2026, 6, 1), at(2026, 6, 3, 23));
    expect(keys).toHaveLength(3);
    expect(keys[0]).toBe(startOfDay(at(2026, 6, 1)));
    expect(keys[2]).toBe(startOfDay(at(2026, 6, 3)));
  });

  it("returns a single day when from and to share a day", () => {
    expect(dayKeys(at(2026, 6, 1, 1), at(2026, 6, 1, 23))).toHaveLength(1);
  });
});

describe("tallyByDay", () => {
  it("zero-fills every day in the range", () => {
    const result = tallyByDay([at(2026, 6, 2)], at(2026, 6, 1), at(2026, 6, 3));
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.count)).toEqual([0, 1, 0]);
  });

  it("counts multiple timestamps on the same day", () => {
    const result = tallyByDay(
      [at(2026, 6, 2, 9), at(2026, 6, 2, 17), at(2026, 6, 2, 20)],
      at(2026, 6, 1),
      at(2026, 6, 2),
    );
    expect(result[1]!.count).toBe(3);
  });

  it("ignores timestamps outside the range", () => {
    const result = tallyByDay(
      [at(2026, 5, 30), at(2026, 6, 5)],
      at(2026, 6, 1),
      at(2026, 6, 2),
    );
    expect(result.every((r) => r.count === 0)).toBe(true);
  });
});

describe("tallyByKey", () => {
  it("counts items by a derived key and skips empty keys", () => {
    const items = [
      { c: "a" },
      { c: "a" },
      { c: "b" },
      { c: "" },
      { c: undefined },
    ];
    const map = tallyByKey(items, (i) => i.c);
    expect(map.get("a")).toBe(2);
    expect(map.get("b")).toBe(1);
    expect(map.has("")).toBe(false);
  });
});

describe("resolveRange", () => {
  it("spans 7 inclusive days for the 7d preset", () => {
    const now = at(2026, 6, 7);
    const { from, to } = resolveRange("7d", now);
    expect(dayKeys(from, to)).toHaveLength(7);
  });

  it("uses the earliest timestamp for the all preset", () => {
    const now = at(2026, 6, 7);
    const earliest = at(2026, 6, 1);
    const { from } = resolveRange("all", now, earliest);
    expect(from).toBe(startOfDay(earliest));
  });

  it("uses the explicit window for the custom preset", () => {
    const from = at(2026, 6, 1);
    const to = at(2026, 6, 10, 23);
    const r = resolveRange("custom", at(2026, 6, 15), undefined, { from, to });
    expect(r.from).toBe(startOfDay(from));
    expect(r.to).toBe(to);
  });

  it("falls back to all-time when custom has no window yet", () => {
    const now = at(2026, 6, 15);
    const earliest = at(2026, 6, 1);
    const r = resolveRange("custom", now, earliest);
    expect(r.from).toBe(startOfDay(earliest));
  });
});

describe("eventsInRange", () => {
  it("keeps only events within the window", () => {
    const events: AppEvent[] = [
      { id: "1", type: "message_sent", at: at(2026, 6, 1), day: 0 },
      { id: "2", type: "message_sent", at: at(2026, 6, 5), day: 0 },
      { id: "3", type: "message_sent", at: at(2026, 6, 9), day: 0 },
    ];
    const filtered = eventsInRange(events, {
      from: at(2026, 6, 2),
      to: at(2026, 6, 6),
    });
    expect(filtered.map((e) => e.id)).toEqual(["2"]);
  });
});

describe("mergeDaySeries", () => {
  it("aligns multiple series by day", () => {
    const from = at(2026, 6, 1);
    const to = at(2026, 6, 2);
    const sent = tallyByDay([at(2026, 6, 1), at(2026, 6, 1)], from, to);
    const calls = tallyByDay([at(2026, 6, 2)], from, to);
    const merged = mergeDaySeries({ sent, calls });
    expect(merged).toHaveLength(2);
    expect(merged[0]!.values).toEqual({ sent: 2, calls: 0 });
    expect(merged[1]!.values).toEqual({ sent: 0, calls: 1 });
  });
});
