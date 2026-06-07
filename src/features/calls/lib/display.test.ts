import { describe, expect, it } from "vitest";
import type { CallEntry } from "@/lib/types";
import { CALL_SORTS, recomputeFromHistory, sortCalls } from "./display";

/** Minimal call entry with sane defaults, overridable per test. */
function entry(over: Partial<CallEntry> & { id: string }): CallEntry {
  return {
    contactId: over.id,
    campaignIds: [],
    outcome: "pending",
    attempts: 0,
    history: [],
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

const nameOf = (e: CallEntry) => ({ a: "Zara", b: "Amit", c: "Meera" })[e.id] ?? e.id;

describe("sortCalls", () => {
  it("does not mutate the input array", () => {
    const input = [entry({ id: "a", updatedAt: 1 }), entry({ id: "b", updatedAt: 2 })];
    const snapshot = [...input];
    sortCalls(input, "recent", nameOf);
    expect(input).toEqual(snapshot);
  });

  it("recent: orders by most recent activity first", () => {
    const list = [
      entry({ id: "a", updatedAt: 10 }),
      entry({ id: "b", updatedAt: 30 }),
      entry({ id: "c", updatedAt: 20 }),
    ];
    expect(sortCalls(list, "recent", nameOf).map((e) => e.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("upcoming: soonest scheduled first, unscheduled last", () => {
    const list = [
      entry({ id: "a", updatedAt: 5 }),
      entry({ id: "b", nextCallAt: 200 }),
      entry({ id: "c", nextCallAt: 100 }),
    ];
    expect(sortCalls(list, "upcoming", nameOf).map((e) => e.id)).toEqual([
      "c",
      "b",
      "a",
    ]);
  });

  it("logged: most recent outcome first, never-logged last", () => {
    const list = [
      entry({ id: "a" }),
      entry({ id: "b", lastOutcomeAt: 50 }),
      entry({ id: "c", lastOutcomeAt: 90 }),
    ];
    expect(sortCalls(list, "logged", nameOf).map((e) => e.id)).toEqual([
      "c",
      "b",
      "a",
    ]);
  });

  it("name: sorts alphabetically by resolved name", () => {
    const list = [entry({ id: "a" }), entry({ id: "b" }), entry({ id: "c" })];
    // a→Zara, b→Amit, c→Meera
    expect(sortCalls(list, "name", nameOf).map((e) => e.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("added: newest on the list first", () => {
    const list = [
      entry({ id: "a", createdAt: 10 }),
      entry({ id: "b", createdAt: 30 }),
      entry({ id: "c", createdAt: 20 }),
    ];
    expect(sortCalls(list, "added", nameOf).map((e) => e.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("exposes a label for every sort value", () => {
    for (const s of CALL_SORTS) {
      expect(s.label.length).toBeGreaterThan(0);
    }
  });
});

describe("recomputeFromHistory", () => {
  it("returns pending defaults for empty history", () => {
    expect(recomputeFromHistory([])).toEqual({
      outcome: "pending",
      attempts: 0,
      lastOutcomeAt: undefined,
    });
  });

  it("counts only called/no_answer as attempts", () => {
    const history = [
      { at: 10, outcome: "called" as const },
      { at: 20, outcome: "skipped" as const },
      { at: 30, outcome: "no_answer" as const },
    ];
    expect(recomputeFromHistory(history).attempts).toBe(2);
  });

  it("mirrors the latest log for outcome and lastOutcomeAt", () => {
    const history = [
      { at: 10, outcome: "called" as const },
      { at: 30, outcome: "skipped" as const },
    ];
    const r = recomputeFromHistory(history);
    expect(r.outcome).toBe("skipped");
    expect(r.lastOutcomeAt).toBe(30);
  });

  it("falls back to pending when the last log is removed", () => {
    // Simulates deleting the only entry: derived state resets cleanly.
    expect(recomputeFromHistory([]).outcome).toBe("pending");
  });
});
