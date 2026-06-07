import { create } from "zustand";

/**
 * Transient selection state for the contact explorer. This is deliberately UI
 * state (not persisted): it tracks the current search query and the set of
 * selected contact ids that bulk actions operate on.
 */
interface SelectionState {
  query: string;
  selected: Set<string>;
  setQuery: (query: string) => void;
  toggle: (id: string) => void;
  /** Replace the selection with exactly these ids (Select Search Results). */
  setSelection: (ids: string[]) => void;
  /** Add ids to the current selection without removing existing ones. */
  addSelection: (ids: string[]) => void;
  /**
   * Select-all toggle over a given set of ids: if every id is already selected,
   * clears them; otherwise adds them all. Powers the "Select all" affordance.
   */
  toggleAll: (ids: string[]) => void;
  clear: () => void;
  isSelected: (id: string) => boolean;
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  query: "",
  selected: new Set<string>(),

  setQuery: (query) => set({ query }),

  toggle: (id) =>
    set((state) => {
      const next = new Set(state.selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selected: next };
    }),

  setSelection: (ids) => set({ selected: new Set(ids) }),

  addSelection: (ids) =>
    set((state) => {
      const next = new Set(state.selected);
      for (const id of ids) next.add(id);
      return { selected: next };
    }),

  toggleAll: (ids) =>
    set((state) => {
      const allSelected =
        ids.length > 0 && ids.every((id) => state.selected.has(id));
      const next = new Set(state.selected);
      if (allSelected) {
        for (const id of ids) next.delete(id);
      } else {
        for (const id of ids) next.add(id);
      }
      return { selected: next };
    }),

  clear: () => set({ selected: new Set<string>() }),

  isSelected: (id) => get().selected.has(id),
}));
