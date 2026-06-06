"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Tags, Plus, Send, Trash2 } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import type { Category } from "@/lib/types";
import { categoriesRepo } from "../lib/repository";
import { CategoryEditSheet } from "./CategoryEditSheet";
import { CampaignCreateSheet } from "@/features/campaigns/components/CampaignCreateSheet";

export function CategoriesManager({ embedded = false }: { embedded?: boolean } = {}) {
  const router = useRouter();
  const categories = useLiveQuery(() => categoriesRepo.all(), []);
  const counts = useLiveQuery(() => categoriesRepo.memberCounts(), []) ?? {};

  const [newName, setNewName] = React.useState("");
  const [campaignCategoryId, setCampaignCategoryId] = React.useState<
    string | null
  >(null);
  const [editing, setEditing] = React.useState<Category | null>(null);

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    await categoriesRepo.create(name);
    setNewName("");
  };

  const remove = async (id: string, name: string) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete category “${name}”? Contacts are kept.`)
    ) {
      return;
    }
    await categoriesRepo.delete(id);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!embedded && (
        <AppHeader
          title="Categories"
          icon={Tags}
          subtitle={categories ? `${categories.length} total` : undefined}
        />
      )}

      <div className="px-5 pb-3 pt-3">
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New category, e.g. Villa Buyers"
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <Button size="icon" onClick={create} disabled={!newName.trim()} aria-label="Create category">
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
      {categories && categories.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="No categories yet"
          description="Group prospects like Hot Leads, Villa Buyers or Whitefield Leads to target your outreach."
        />
      ) : (
        <ul className="space-y-2 px-4 pb-nav pt-1">
          {categories?.map((c) => {
            const count = counts[c.id] ?? 0;
            return (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/80 p-3 shadow-soft"
              >
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-inset ring-black/5"
                  style={{ backgroundColor: c.color }}
                  aria-hidden
                />
                <button
                  type="button"
                  onClick={() => setEditing(c)}
                  className="min-w-0 flex-1 text-left"
                  aria-label={`Edit ${c.name}`}
                >
                  <p className="truncate font-semibold text-foreground">
                    {c.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {count.toLocaleString()} contact{count === 1 ? "" : "s"} · Edit
                  </p>
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setCampaignCategoryId(c.id)}
                  disabled={count === 0}
                  aria-label={`Start campaign for ${c.name}`}
                >
                  <Send className="h-5 w-5 text-primary" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => remove(c.id, c.name)}
                  aria-label={`Delete ${c.name}`}
                >
                  <Trash2 className="h-5 w-5 text-muted-foreground" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      </div>

      <CategoryEditSheet
        category={editing}
        onClose={() => setEditing(null)}
      />

      <CampaignCreateSheet
        open={campaignCategoryId !== null}
        defaultCategoryId={campaignCategoryId ?? undefined}
        onClose={() => setCampaignCategoryId(null)}
        onCreated={(id) => router.push(`/campaigns/${id}`)}
      />
    </div>
  );
}
