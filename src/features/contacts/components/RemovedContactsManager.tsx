"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  Search,
  X,
  UserX,
  RotateCcw,
  Trash2,
  CheckCheck,
  CheckSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { contactsRepo } from "../lib/repository";

/**
 * Full-screen manager for soft-removed contacts (the blocklist). Lets the user
 * search, multi-select, and bulk Restore or permanently Delete-forever — the
 * heavier counterpart to the quick summary shown in Settings. Both destructive
 * paths confirm first (data-safety rule); "Delete forever" also purges call
 * entries and campaign messages via `contactsRepo.delete`.
 */
export function RemovedContactsManager() {
  const router = useRouter();
  const removed = useLiveQuery(() => contactsRepo.removedList(), []);

  const [query, setQuery] = React.useState("");
  const [picked, setPicked] = React.useState<Set<string>>(new Set());

  const loading = removed === undefined;

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = removed ?? [];
    if (!q) return list;
    return list.filter((c) => c.searchIndex.includes(q));
  }, [removed, query]);

  const filteredIds = React.useMemo(
    () => filtered.map((c) => c.id),
    [filtered],
  );
  const allPicked =
    filteredIds.length > 0 && filteredIds.every((id) => picked.has(id));

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
      const all = filteredIds.every((id) => prev.has(id));
      const next = new Set(prev);
      for (const id of filteredIds) {
        if (all) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const clearPicked = () => setPicked(new Set());

  const pluralPicked = picked.size === 1 ? "" : "s";

  const restore = async () => {
    const ids = [...picked];
    if (ids.length === 0) return;
    haptic("light");
    await contactsRepo.restore(ids);
    clearPicked();
  };

  const deleteForever = async () => {
    const ids = [...picked];
    if (ids.length === 0) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Permanently delete ${ids.length} contact${ids.length === 1 ? "" : "s"}? This can't be undone — their contact details, call history and campaign messages are erased forever, and a future import could re-add them.`,
      )
    ) {
      return;
    }
    haptic("warning");
    await contactsRepo.delete(ids);
    clearPicked();
  };

  return (
    <div className="flex h-dvh flex-col">
      <header className="glass sticky top-0 z-30 border-b border-border/60">
        <div className="flex items-center gap-2 px-4 pb-3 pt-[max(0.9rem,env(safe-area-inset-top))]">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            aria-label="Back to settings"
            className="-ml-2"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Removed contacts
            </h1>
            {removed && (
              <p className="truncate text-sm font-medium text-muted-foreground">
                {removed.length} removed
              </p>
            )}
          </div>
        </div>
      </header>

      {/* Search */}
      <div className="border-b border-border/60 px-5 pb-3 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search removed contacts…"
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
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        ) : (removed?.length ?? 0) === 0 ? (
          <EmptyState
            icon={UserX}
            title="No removed contacts"
            description="Contacts you remove (no WhatsApp / out of domain) collect here. They're hidden from every list and skipped on import."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No matches"
            description={`Nothing in your removed list matched “${query}”.`}
          />
        ) : (
          <ul className="space-y-2 p-4 pb-nav">
            {filtered.map((c) => {
              const label = c.fullName || c.phone;
              const sel = picked.has(c.id);
              return (
                <li key={c.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => togglePick(c.id)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        togglePick(c.id);
                      }
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 rounded-2xl border bg-card p-3 text-left shadow-soft transition-all hover:shadow-card active:scale-[0.99]",
                      sel
                        ? "border-primary/40 ring-1 ring-primary/25"
                        : "border-hairline",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-foreground">
                        {label}
                      </span>
                      <span className="block truncate text-sm tabular-nums text-muted-foreground">
                        {c.phone}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                        sel
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border",
                      )}
                    >
                      {sel && <CheckSquare className="h-3.5 w-3.5" />}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Bulk action bar — floats above the safe area when anything is picked. */}
      {picked.size > 0 && (
        <div className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
          <div className="glass flex w-full max-w-md items-center gap-2 rounded-2xl border border-white/60 px-3 py-2 shadow-float animate-in slide-in-from-bottom-2">
            <button
              type="button"
              onClick={clearPicked}
              className="flex items-center gap-1.5 rounded-xl bg-secondary px-2.5 py-1.5 text-sm font-semibold text-foreground hover:bg-secondary/70"
            >
              <X className="h-4 w-4" />
              {picked.size}
            </button>
            <div className="ml-auto flex gap-1.5">
              <Button
                size="sm"
                variant={allPicked ? "secondary" : "outline"}
                onClick={toggleAll}
                disabled={filtered.length === 0}
                aria-label={allPicked ? "Deselect all" : "Select all"}
              >
                <CheckCheck className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={restore}>
                <RotateCcw className="h-4 w-4" />
                Restore
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={deleteForever}
                aria-label={`Delete ${picked.size} contact${pluralPicked} forever`}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
