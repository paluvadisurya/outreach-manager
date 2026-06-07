"use client";

import * as React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Minus, FolderPlus } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { haptic } from "@/lib/haptics";
import { categoriesRepo } from "@/features/categories/lib/repository";
import { contactsRepo } from "../lib/repository";

interface AssignCategorySheetProps {
  open: boolean;
  mode: "add" | "remove";
  contactIds: string[];
  onClose: () => void;
  onDone: () => void;
}

export function AssignCategorySheet({
  open,
  mode,
  contactIds,
  onClose,
  onDone,
}: AssignCategorySheetProps) {
  const categories = useLiveQuery(() => categoriesRepo.all(), []) ?? [];
  const [newName, setNewName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const apply = async (categoryId: string) => {
    setBusy(true);
    haptic("light");
    try {
      if (mode === "add") {
        await contactsRepo.addToCategory(contactIds, categoryId);
      } else {
        await contactsRepo.removeFromCategory(contactIds, categoryId);
      }
      onDone();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const createAndAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const category = await categoriesRepo.create(name);
      await contactsRepo.addToCategory(contactIds, category.id);
      setNewName("");
      onDone();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={mode === "add" ? "Add to category" : "Remove from category"}
      description={`${contactIds.length} contact${
        contactIds.length === 1 ? "" : "s"
      } selected`}
    >
      <div className="space-y-5">
        {mode === "add" && (
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New category name"
              onKeyDown={(e) => e.key === "Enter" && createAndAdd()}
            />
            <Button
              size="icon"
              onClick={createAndAdd}
              disabled={busy || !newName.trim()}
              aria-label="Create category and add"
            >
              <FolderPlus className="h-5 w-5" />
            </Button>
          </div>
        )}

        <div className="space-y-2">
          {categories.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No categories yet
              {mode === "add" ? " — create one above." : "."}
            </p>
          )}
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={busy}
              onClick={() => apply(c.id)}
              className="flex min-h-touch w-full items-center justify-between rounded-2xl border border-hairline bg-card px-3.5 text-left shadow-soft transition-all hover:bg-secondary active:scale-[0.99] disabled:opacity-50"
            >
              <span className="flex items-center gap-2.5 truncate">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ring-black/[0.06]"
                  style={{ backgroundColor: `${c.color}1f` }}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                </span>
                <span className="truncate text-sm text-foreground">
                  {c.name}
                </span>
              </span>
              {mode === "add" ? (
                <Plus className="h-4 w-4 shrink-0 text-primary" />
              ) : (
                <Minus className="h-4 w-4 shrink-0 text-destructive" />
              )}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
