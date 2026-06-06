"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Phone,
  Plus,
  Search,
  X,
  CalendarClock,
  CheckSquare,
  Send,
} from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { CallEntry, Contact } from "@/lib/types";
import { contactsRepo } from "@/features/contacts/lib/repository";
import { CampaignCreateSheet } from "@/features/campaigns/components/CampaignCreateSheet";
import { callsRepo } from "../lib/repository";
import { OUTCOME_META, formatCallTime } from "../lib/display";
import { AddToCallSheet } from "./AddToCallSheet";
import { CallDetailSheet } from "./CallDetailSheet";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function CallManager() {
  const router = useRouter();
  const calls = useLiveQuery(() => callsRepo.list(), []);
  const contacts = useLiveQuery(() => contactsRepo.all(), []);

  const [query, setQuery] = React.useState("");
  const [addOpen, setAddOpen] = React.useState(false);
  const [openContactId, setOpenContactId] = React.useState<string | null>(null);

  // Multi-select on the call list → create one campaign for the chosen contacts.
  const [selectMode, setSelectMode] = React.useState(false);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [campaignOpen, setCampaignOpen] = React.useState(false);

  const contactMap = React.useMemo(() => {
    const map = new Map<string, Contact>();
    for (const c of contacts ?? []) map.set(c.id, c);
    return map;
  }, [contacts]);

  const loading = calls === undefined || contacts === undefined;

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = calls ?? [];
    if (!q) return list;
    return list.filter((e) =>
      contactMap.get(e.contactId)?.searchIndex.includes(q),
    );
  }, [calls, contactMap, query]);

  const nameFor = (e: CallEntry) => {
    const c = contactMap.get(e.contactId);
    return c?.fullName || c?.phone || e.contactId;
  };
  const phoneFor = (e: CallEntry) => contactMap.get(e.contactId)?.phone ?? "";

  const exitSelect = React.useCallback(() => {
    setSelectMode(false);
    setPicked(new Set());
  }, []);

  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onRowTap = (e: CallEntry) => {
    if (selectMode) togglePick(e.contactId);
    else setOpenContactId(e.contactId);
  };

  // After a campaign is created from the selection, link it back to those call
  // entries (so the messages surface as talking points) and open it.
  const onCampaignCreated = (id: string) => {
    const ids = [...picked];
    void callsRepo.addContacts(ids, [id]);
    exitSelect();
    router.push(`/campaigns/${id}`);
  };

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader
        title="Call"
        icon={Phone}
        subtitle={calls ? `${calls.length} on your list` : undefined}
        action={
          <Button
            size="icon"
            onClick={() => setAddOpen(true)}
            aria-label="Add contacts to call list"
          >
            <Plus className="h-5 w-5" />
          </Button>
        }
      />

      {/* Search + select */}
      <div className="border-b border-border/60 px-5 pb-3 pt-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your call list…"
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
          {(calls?.length ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
              className={cn(
                "flex min-h-touch shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors",
                selectMode
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-foreground hover:bg-secondary/80",
              )}
            >
              {selectMode ? (
                <>
                  <X className="h-4 w-4" />
                  Done
                </>
              ) : (
                <>
                  <CheckSquare className="h-4 w-4" />
                  Select
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        ) : (calls?.length ?? 0) === 0 ? (
          <EmptyState
            icon={Phone}
            title="Build your call list"
            description="Add contacts from a category, search for people, or pull everyone from a campaign — then track calls and schedule follow-ups."
            action={
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="h-5 w-5" />
                Add contacts
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No matches"
            description={`Nothing on your call list matched “${query}”.`}
          />
        ) : (
          <ul className="space-y-2 p-4 pb-nav">
            {filtered.map((e) => {
              const meta = OUTCOME_META[e.outcome];
              const sel = picked.has(e.contactId);
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => onRowTap(e)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border bg-card/80 p-3 text-left shadow-soft transition-all hover:shadow-card",
                      sel
                        ? "border-primary/50 ring-1 ring-primary/30"
                        : "border-border/70",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold",
                        selectMode && sel
                          ? "bg-primary text-primary-foreground"
                          : "bg-accent text-accent-foreground",
                      )}
                    >
                      {selectMode && sel ? (
                        <CheckSquare className="h-5 w-5" />
                      ) : (
                        initials(nameFor(e))
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-foreground">
                        {nameFor(e)}
                      </span>
                      <span className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="truncate">{phoneFor(e)}</span>
                        {e.campaignIds.length > 0 && (
                          <span className="shrink-0">
                            · {e.campaignIds.length} campaign
                            {e.campaignIds.length === 1 ? "" : "s"}
                          </span>
                        )}
                      </span>
                      {e.nextCallAt && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-foreground">
                          <CalendarClock className="h-3 w-3" />
                          {formatCallTime(e.nextCallAt)}
                        </span>
                      )}
                    </span>
                    {selectMode ? (
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
                    ) : (
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Selection action bar — create a campaign from the chosen contacts. */}
      {selectMode && (
        <div className="glass sticky bottom-0 z-20 flex items-center gap-3 border-t border-border/60 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <span className="text-sm font-medium text-muted-foreground">
            {picked.size} selected
          </span>
          <Button
            className="ml-auto"
            disabled={picked.size === 0}
            onClick={() => setCampaignOpen(true)}
          >
            <Send className="h-4 w-4" />
            Create campaign
          </Button>
        </div>
      )}

      <AddToCallSheet open={addOpen} onClose={() => setAddOpen(false)} />

      <CallDetailSheet
        contactId={openContactId}
        onClose={() => setOpenContactId(null)}
      />

      <CampaignCreateSheet
        open={campaignOpen}
        onClose={() => setCampaignOpen(false)}
        onCreated={onCampaignCreated}
        contactIds={[...picked]}
      />
    </div>
  );
}
