"use client";

import * as React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Search, Tags, Send, Users } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { contactsRepo } from "@/features/contacts/lib/repository";
import { categoriesRepo } from "@/features/categories/lib/repository";
import { campaignsRepo } from "@/features/campaigns/lib/repository";
import { filterContacts } from "@/features/contacts/lib/search";
import { callsRepo } from "../lib/repository";

type Mode = "category" | "search" | "campaign";

interface AddToCallSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Add contacts to the call list three ways (per the brief): pick a whole
 * category, search individuals, or pull everyone from a campaign. Existing call
 * entries are preserved by `callsRepo.addContacts` — re-adding never resets an
 * outcome or history.
 */
export function AddToCallSheet({ open, onClose }: AddToCallSheetProps) {
  const [mode, setMode] = React.useState<Mode>("category");
  const [query, setQuery] = React.useState("");
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<string | null>(null);

  const categories = useLiveQuery(() => categoriesRepo.all(), []) ?? [];
  const counts = useLiveQuery(() => categoriesRepo.memberCounts(), []) ?? {};
  const campaigns = useLiveQuery(() => campaignsRepo.all(), []) ?? [];
  const contacts = useLiveQuery(() => contactsRepo.all(), []) ?? [];

  React.useEffect(() => {
    if (open) {
      setMode("category");
      setQuery("");
      setPicked(new Set());
      setDone(null);
    }
  }, [open]);

  const searchResults = React.useMemo(
    () => (query.trim() ? filterContacts(contacts, query).slice(0, 50) : []),
    [contacts, query],
  );

  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Whether every contact currently in the search results is already picked.
  const allResultsPicked =
    searchResults.length > 0 && searchResults.every((c) => picked.has(c.id));

  // Select (or clear) all contacts in the current search results at once.
  const toggleAllResults = () => {
    haptic("light");
    setPicked((prev) => {
      const next = new Set(prev);
      if (searchResults.every((c) => next.has(c.id))) {
        for (const c of searchResults) next.delete(c.id);
      } else {
        for (const c of searchResults) next.add(c.id);
      }
      return next;
    });
  };

  const report = (n: number) => {
    haptic(n > 0 ? "success" : "light");
    setDone(
      n === 0
        ? "Everyone selected was already on your call list."
        : `Added ${n} contact${n === 1 ? "" : "s"} to your call list.`,
    );
  };

  const addCategory = async (categoryId: string) => {
    setBusy(true);
    try {
      const inCat = await contactsRepo.inCategory(categoryId);
      report(await callsRepo.addContacts(inCat.map((c) => c.id)));
    } finally {
      setBusy(false);
    }
  };

  const addCampaign = async (campaignId: string) => {
    setBusy(true);
    try {
      report(await callsRepo.addFromCampaign(campaignId));
    } finally {
      setBusy(false);
    }
  };

  const addPicked = async () => {
    setBusy(true);
    try {
      report(await callsRepo.addContacts([...picked]));
      setPicked(new Set());
    } finally {
      setBusy(false);
    }
  };

  const modes: { key: Mode; label: string; icon: typeof Tags }[] = [
    { key: "category", label: "Category", icon: Tags },
    { key: "search", label: "Search", icon: Search },
    { key: "campaign", label: "Campaign", icon: Send },
  ];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add to call list"
      description="Pick a category, search people, or pull a whole campaign."
      footer={
        mode === "search" ? (
          <Button
            className="w-full"
            disabled={picked.size === 0 || busy}
            onClick={addPicked}
          >
            {busy ? "Adding…" : `Add ${picked.size || ""} selected`}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {/* Mode switch */}
        <div className="flex gap-1.5 rounded-2xl bg-secondary/60 p-1">
          {modes.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-sm font-semibold transition-colors",
                  mode === m.key
                    ? "bg-card text-foreground shadow-soft"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {m.label}
              </button>
            );
          })}
        </div>

        {done && (
          <div className="flex items-start gap-2 rounded-xl bg-accent p-3 text-sm text-accent-foreground">
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{done}</span>
          </div>
        )}

        {mode === "category" && (
          <div className="space-y-2">
            {categories.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No categories yet. Create one from the Contacts area.
              </p>
            )}
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={busy}
                onClick={() => addCategory(c.id)}
                className="flex min-h-touch w-full items-center justify-between gap-2 rounded-2xl border border-hairline bg-card px-4 text-left hover:bg-secondary disabled:opacity-50"
              >
                <span className="flex items-center gap-2">
                  <Tags className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-foreground">{c.name}</span>
                </span>
                <span className="text-sm text-muted-foreground">
                  {counts[c.id] ?? 0}
                </span>
              </button>
            ))}
          </div>
        )}

        {mode === "search" && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, phone, company…"
                className="pl-11"
                inputMode="search"
                autoFocus
              />
            </div>
            {query.trim() === "" ? (
              <p className="px-1 text-sm text-muted-foreground">
                Start typing to find contacts.
              </p>
            ) : searchResults.length === 0 ? (
              <p className="px-1 text-sm text-muted-foreground">
                No contacts matched “{query}”.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs text-muted-foreground">
                    {searchResults.length} result
                    {searchResults.length === 1 ? "" : "s"}
                    {picked.size > 0 ? ` · ${picked.size} selected` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={toggleAllResults}
                    className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-foreground hover:bg-secondary/70"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {allResultsPicked ? "Clear all" : "Select all"}
                  </button>
                </div>
                <ul className="space-y-2">
                  {searchResults.map((c) => {
                  const sel = picked.has(c.id);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => togglePick(c.id)}
                        aria-pressed={sel}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors",
                          sel
                            ? "border-primary/40 bg-accent"
                            : "border-hairline bg-card hover:bg-secondary",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                            sel
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-muted-foreground",
                          )}
                        >
                          {sel ? (
                            <Check className="h-5 w-5" />
                          ) : (
                            <Users className="h-4 w-4" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-foreground">
                            {c.fullName || c.phone}
                          </span>
                          <span className="block truncate text-sm text-muted-foreground">
                            {c.phone}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
                </ul>
              </>
            )}
          </div>
        )}

        {mode === "campaign" && (
          <div className="space-y-2">
            {campaigns.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No campaigns yet.
              </p>
            )}
            {campaigns.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={busy}
                onClick={() => addCampaign(c.id)}
                className="flex min-h-touch w-full items-center justify-between gap-2 rounded-2xl border border-hairline bg-card px-4 text-left hover:bg-secondary disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">
                    {c.name}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {c.sourceLabel}
                  </span>
                </span>
                <Send className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
