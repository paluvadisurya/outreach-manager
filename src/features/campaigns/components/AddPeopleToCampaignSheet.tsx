"use client";

import * as React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Search, X, Check, CheckCheck } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { contactsRepo } from "@/features/contacts/lib/repository";
import { filterContacts } from "@/features/contacts/lib/search";
import { initials, tintFor } from "@/features/contacts/lib/avatar";
import { campaignsRepo } from "../lib/repository";

interface AddPeopleToCampaignSheetProps {
  open: boolean;
  campaignId: string;
  onClose: () => void;
  /** Called after contacts are added, with how many new messages were created. */
  onAdded?: (count: number) => void;
}

/** Cap rendered rows; "Select all" still operates on the full match set. */
const DISPLAY_CAP = 200;

/**
 * Pick contacts to drop into an existing campaign (Req #3). Searchable
 * multi-select over everyone not already in the campaign; confirming calls
 * `campaignsRepo.addContacts`, which renders each a message from the primary
 * template and keeps them on a refresh.
 */
export function AddPeopleToCampaignSheet({
  open,
  campaignId,
  onClose,
  onAdded,
}: AddPeopleToCampaignSheetProps) {
  const allContacts = useLiveQuery(() => contactsRepo.all(), []) ?? [];
  // Who's already in the campaign, so we don't offer them again.
  const existing = useLiveQuery(
    () => (open ? campaignsRepo.messagesFor(campaignId) : Promise.resolve([])),
    [open, campaignId],
  );

  const [query, setQuery] = React.useState("");
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setQuery("");
      setPicked(new Set());
    }
  }, [open]);

  const existingIds = React.useMemo(
    () => new Set((existing ?? []).map((m) => m.contactId)),
    [existing],
  );

  const candidates = React.useMemo(
    () => allContacts.filter((c) => !existingIds.has(c.id)),
    [allContacts, existingIds],
  );
  const matches = React.useMemo(
    () => filterContacts(candidates, query),
    [candidates, query],
  );
  const display = matches.slice(0, DISPLAY_CAP);
  const matchIds = React.useMemo(() => matches.map((c) => c.id), [matches]);
  const allPicked = matchIds.length > 0 && matchIds.every((id) => picked.has(id));

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

  const add = async () => {
    const ids = [...picked];
    if (ids.length === 0 || busy) return;
    setBusy(true);
    try {
      const count = await campaignsRepo.addContacts(campaignId, ids);
      haptic("success");
      onAdded?.(count);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add people"
      description="Add contacts to this campaign. Each gets a message from the primary template."
      footer={
        <Button
          className="w-full"
          disabled={picked.size === 0 || busy}
          onClick={add}
        >
          {busy
            ? "Adding…"
            : `Add ${picked.size || ""} ${picked.size === 1 ? "person" : "people"}`.trim()}
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Search */}
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

        {/* Count + select all */}
        {matches.length > 0 && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              {matches.length.toLocaleString()} available
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
          <p className="py-8 text-center text-sm text-muted-foreground">
            {query
              ? "No matching contacts."
              : candidates.length === 0
                ? "Everyone is already in this campaign."
                : "No contacts to add."}
          </p>
        ) : (
          <ul className="space-y-2">
            {display.map((c) => {
              const name = c.fullName || c.phone;
              const sel = picked.has(c.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => togglePick(c.id)}
                    aria-pressed={sel}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors",
                      sel
                        ? "border-primary/40 bg-accent"
                        : "border-hairline bg-card hover:bg-secondary",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-bold",
                        sel ? "bg-primary text-primary-foreground" : tintFor(c.id),
                      )}
                      aria-hidden
                    >
                      {sel ? <Check className="h-5 w-5" /> : initials(name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-foreground">
                        {name}
                      </span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {[c.designation, c.company].filter(Boolean).join(" · ") ||
                          c.phone}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
