"use client";

import * as React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Search,
  X,
  Plus,
  Minus,
  Check,
  CheckCheck,
  UserMinus,
  FolderMinus,
} from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import type { Category } from "@/lib/types";
import { contactsRepo } from "@/features/contacts/lib/repository";
import { filterContacts } from "@/features/contacts/lib/search";
import { categoriesRepo } from "../lib/repository";

interface CategoryEditSheetProps {
  category: Category | null;
  onClose: () => void;
}

/** Cap how many rows we render; select-all still operates on the full match set. */
const DISPLAY_CAP = 200;

/**
 * Edit a category: rename it, and add or remove members. Both the Members and Add
 * views are searchable and support multi-select with "Select all results", so the
 * user can e.g. search a city and add every match to a group in two taps. Members
 * can also be removed from the group or removed as contacts entirely.
 */
export function CategoryEditSheet({ category, onClose }: CategoryEditSheetProps) {
  const open = category !== null;
  const categoryId = category?.id ?? "";

  const allContacts = useLiveQuery(() => contactsRepo.all(), []) ?? [];
  const [nameDraft, setNameDraft] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (open) {
      setNameDraft(category?.name ?? "");
      setQuery("");
      setAdding(false);
      setPicked(new Set());
    }
  }, [open, category?.name]);

  const switchMode = (next: boolean) => {
    setAdding(next);
    setQuery("");
    setPicked(new Set());
  };

  const members = React.useMemo(
    () => allContacts.filter((c) => c.categoryIds.includes(categoryId)),
    [allContacts, categoryId],
  );
  const nonMembers = React.useMemo(
    () => allContacts.filter((c) => !c.categoryIds.includes(categoryId)),
    [allContacts, categoryId],
  );

  // Full match set drives counts + select-all; the rendered slice is capped.
  const matches = React.useMemo(
    () => filterContacts(adding ? nonMembers : members, query),
    [adding, nonMembers, members, query],
  );
  const display = matches.slice(0, DISPLAY_CAP);
  const matchIds = React.useMemo(() => matches.map((c) => c.id), [matches]);
  const allPicked = matchIds.length > 0 && matchIds.every((id) => picked.has(id));
  const pickedIds = React.useMemo(() => [...picked], [picked]);

  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () => {
    haptic("light");
    setPicked((prev) => {
      const all = matchIds.every((id) => prev.has(id));
      const next = new Set(prev);
      for (const id of matchIds) {
        if (all) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const saveName = async () => {
    const next = nameDraft.trim();
    if (next && next !== category?.name) {
      await categoriesRepo.rename(categoryId, next);
    }
  };

  // Per-row instant actions.
  const addOne = (id: string) => {
    haptic("light");
    void contactsRepo.addToCategory([id], categoryId);
  };
  const removeOneFromGroup = (id: string) => {
    haptic("light");
    void contactsRepo.removeFromCategory([id], categoryId);
  };

  // Bulk actions over the current selection.
  const bulkAdd = async () => {
    if (!pickedIds.length) return;
    haptic("light");
    await contactsRepo.addToCategory(pickedIds, categoryId);
    setPicked(new Set());
  };
  const bulkRemoveFromGroup = async () => {
    if (!pickedIds.length) return;
    haptic("light");
    await contactsRepo.removeFromCategory(pickedIds, categoryId);
    setPicked(new Set());
  };
  const bulkRemoveContacts = async () => {
    const n = pickedIds.length;
    if (!n) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Remove ${n} contact${n === 1 ? "" : "s"} entirely? They'll be hidden from all lists and skipped on future imports. Restore from Settings → Removed contacts.`,
      )
    ) {
      return;
    }
    haptic("warning");
    await contactsRepo.remove(pickedIds);
    setPicked(new Set());
  };

  const hasPicked = pickedIds.length > 0;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Edit category"
      description={`${members.length} contact${members.length === 1 ? "" : "s"}`}
      footer={
        hasPicked ? (
          adding ? (
            <Button className="w-full" onClick={bulkAdd}>
              <Plus className="h-5 w-5" />
              Add {pickedIds.length} to group
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={bulkRemoveFromGroup}
              >
                <FolderMinus className="h-4 w-4" />
                From group ({pickedIds.length})
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={bulkRemoveContacts}
              >
                <UserMinus className="h-4 w-4 text-destructive" />
                Remove contact
              </Button>
            </div>
          )
        ) : undefined
      }
    >
      <div className="space-y-5">
        {/* Rename */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Name</label>
          <Input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder="Category name"
            onKeyDown={(e) => e.key === "Enter" && void saveName()}
            onBlur={() => void saveName()}
          />
        </div>

        {/* Members / Add toggle */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            {adding ? "Add contacts" : "Members"}
          </h3>
          <Button
            size="sm"
            variant={adding ? "secondary" : "outline"}
            onClick={() => switchMode(!adding)}
          >
            {adding ? (
              <>
                <Check className="h-4 w-4" />
                Done
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Add
              </>
            )}
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              adding ? "Search people to add…" : "Search members…"
            }
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

        {/* Count + select all */}
        {matches.length > 0 && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              {matches.length.toLocaleString()}{" "}
              {adding
                ? `match${matches.length === 1 ? "" : "es"}`
                : `member${matches.length === 1 ? "" : "s"}`}
              {matches.length > DISPLAY_CAP ? ` · showing ${DISPLAY_CAP}` : ""}
            </span>
            <Button
              size="sm"
              variant={allPicked ? "secondary" : "outline"}
              onClick={toggleAll}
            >
              <CheckCheck className="h-4 w-4" />
              {allPicked ? "Deselect all" : "Select all"}
            </Button>
          </div>
        )}

        {/* List */}
        {matches.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {adding
              ? query
                ? "No matching contacts."
                : "Everyone is already in this group."
              : query
                ? "No matching members."
                : "No members yet. Tap “Add” to put contacts in this group."}
          </p>
        ) : (
          <ul className="space-y-2">
            {display.map((c) => (
              <MemberRow
                key={c.id}
                name={c.fullName || c.phone}
                phone={c.phone}
                mode={adding ? "add" : "remove"}
                selected={picked.has(c.id)}
                onToggleSelect={() => togglePick(c.id)}
                onAction={() =>
                  adding ? addOne(c.id) : removeOneFromGroup(c.id)
                }
              />
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

function MemberRow({
  name,
  phone,
  mode,
  selected,
  onToggleSelect,
  onAction,
}: {
  name: string;
  phone: string;
  mode: "add" | "remove";
  selected: boolean;
  onToggleSelect: () => void;
  onAction: () => void;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-2xl border p-3 transition-colors",
        selected ? "border-primary/40 bg-accent" : "border-hairline bg-card",
      )}
    >
      <button
        type="button"
        onClick={onToggleSelect}
        aria-pressed={selected}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-transparent",
          )}
        >
          <Check className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold text-foreground">
            {name}
          </span>
          <span className="block truncate text-sm text-muted-foreground">
            {phone}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onAction}
        aria-label={mode === "add" ? `Add ${name}` : `Remove ${name} from group`}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          mode === "add"
            ? "bg-accent text-primary hover:bg-accent/70"
            : "bg-secondary text-destructive hover:bg-secondary/70",
        )}
      >
        {mode === "add" ? (
          <Plus className="h-5 w-5" />
        ) : (
          <Minus className="h-5 w-5" />
        )}
      </button>
    </li>
  );
}
