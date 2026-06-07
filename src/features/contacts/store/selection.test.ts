import { describe, it, expect, beforeEach } from "vitest";
import { useSelectionStore } from "./selection";

const reset = () => useSelectionStore.setState({ selected: new Set<string>() });
const ids = () => [...useSelectionStore.getState().selected].sort();

describe("selection store: toggleAll", () => {
  beforeEach(reset);

  it("adds every id when not all are selected", () => {
    useSelectionStore.getState().toggleAll(["a", "b", "c"]);
    expect(ids()).toEqual(["a", "b", "c"]);
  });

  it("clears exactly those ids when all are already selected", () => {
    useSelectionStore.getState().setSelection(["a", "b", "c", "x"]);
    useSelectionStore.getState().toggleAll(["a", "b", "c"]);
    // Only the toggled ids are removed; unrelated selections are kept.
    expect(ids()).toEqual(["x"]);
  });

  it("adds missing ids when only some are selected (partial → select all)", () => {
    useSelectionStore.getState().setSelection(["a"]);
    useSelectionStore.getState().toggleAll(["a", "b", "c"]);
    expect(ids()).toEqual(["a", "b", "c"]);
  });

  it("does nothing for an empty id set", () => {
    useSelectionStore.getState().setSelection(["a"]);
    useSelectionStore.getState().toggleAll([]);
    expect(ids()).toEqual(["a"]);
  });
});
