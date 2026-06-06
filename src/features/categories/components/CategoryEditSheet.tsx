"use client";

import * as React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Search, X, Plus, Minus, Check } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/types";
import { contactsRepo } from "@/features/contacts/lib/repository";
import { filterContacts } from "@/features/contacts/lib/search";
import { categoriesRepo } from "../lib/repository";

interface CategoryEditSheetProps {
  category: Category | null;
  onClose: () => void;
}

/**
 * Edit a category: rename it, and add or remove members. Members are read live so
 * the list reflects every add/remove instantly, and the count stays in sync with
 * the rest of the app.
 */
export function CategoryEditSheet({ category, onClose }: CategoryEditSheetProps) {
  const open = category !== null;
  const categoryId = category?.id ?? "";

  const allContacts = useLiveQuery(() => contactsRepo.all(), []) ?? [];
  const [nameDraft, setNameDraft] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setNameDraft(category?.name ?? "");
      setQuery("");
      setAdding(false);
    }
  }, [open, category?.name]);

  const members = React.useMemo(
    () => allContacts.filter((c) => c.categoryIds.includes(categoryId)),
    [allContacts, categoryId],
  );

  // When adding, search across the contacts NOT already in this group.
  const candidates = React.useMemo(() => {
    const nonMembers = allContacts.filter(
      (c) => !c.categoryIds.includes(categoryId),
    );
    return filterContacts(nonMembers, query).slice(0, 50);
  }, [allContacts, categoryId, query]);

  const saveName = async () => {
    const next = nameDraft.trim();
    if (next && next !== category?.name) {
      await categoriesRepo.rename(categoryId, next);
    }
  };

  const removeMember = (contactId: string) =>
    void contactsRepo.removeFromCategory([contactId], categoryId);
  const addMember = (contactId: string) =>
    void contactsRepo.addToCategory([contactId], categoryId);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Edit category"
      description={`${members.length} contact${members.length === 1 ? "" : "s"}`}
    >
      <div className="space-y-5">
        {/* Rename */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Name</label>
          <div className="flex gap-2">
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="Category name"
              onKeyDown={(e) => e.key === "Enter" && void saveName()}
              onBlur={() => void saveName()}
            />
          </div>
        </div>

        {/* Add / done toggle */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            {adding ? "Add contacts" : "Members"}
          </h3>
          <Button
            size="sm"
            variant={adding ? "secondary" : "outline"}
            onClick={() => {
              setAdding((a) => !a);
              setQuery("");
            }}
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

        {adding ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, phone, company…"
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
            {candidates.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {query ? "No matching contacts." : "Everyone is already in this group."}
              </p>
            ) : (
              <ul className="space-y-2">
                {candidates.map((c) => (
                  <MemberRow
                    key={c.id}
                    name={c.fullName || c.phone}
                    phone={c.phone}
                    mode="add"
                    onAction={() => addMember(c.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        ) : members.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No members yet. Tap “Add” to put contacts in this group.
          </p>
        ) : (
          <ul className="space-y-2">
            {members.map((c) => (
              <MemberRow
                key={c.id}
                name={c.fullName || c.phone}
                phone={c.phone}
                mode="remove"
                onAction={() => removeMember(c.id)}
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
  onAction,
}: {
  name: string;
  phone: string;
  mode: "add" | "remove";
  onAction: () => void;
}) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-foreground">{name}</p>
        <p className="truncate text-sm text-muted-foreground">{phone}</p>
      </div>
      <button
        type="button"
        onClick={onAction}
        aria-label={mode === "add" ? `Add ${name}` : `Remove ${name}`}
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
