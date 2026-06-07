"use client";

import * as React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  X,
  Star,
  Trash2,
  SkipForward,
  ListChecks,
  Building2,
  BriefcaseBusiness,
  Mail,
  Tag,
  Undo2,
  PartyPopper,
  type LucideIcon,
} from "lucide-react";
import { HapticButton } from "@/components/ui/haptic-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import type { Contact } from "@/lib/types";
import { contactsRepo } from "../lib/repository";
import { categoriesRepo } from "@/features/categories/lib/repository";
import { eventsRepo } from "@/features/analytics/lib/repository";

/**
 * The contact-cleanup triage tool. A focused, full-screen card stack over every
 * *undecided* contact — active and not yet on the Shortlist. For each, the user
 * makes one quick call:
 *  - Keep  → add to the managed Shortlist group (the curated keepers).
 *  - Drop  → soft-remove (hidden everywhere, skipped on import; reversible).
 *  - Skip  → leave undecided for later.
 *
 * There's no fixed target or pressure to clear everyone: it's a list you
 * maintain at your own pace and can close anytime, with whatever's left waiting
 * for the next pass. Drops are reversible — both via an in-flow Undo and from
 * Settings → Removed contacts — and the first drop of a session is confirmed.
 */
export function CleanupTriage({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const contacts = useLiveQuery(() => contactsRepo.all(), []);
  const removed = useLiveQuery(() => contactsRepo.removedList(), []);
  const categories = useLiveQuery(() => categoriesRepo.all(), []);
  const shortlist = useLiveQuery(() => categoriesRepo.getShortlist(), []);

  const shortlistId = shortlist?.id;
  const categoryName = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories ?? []) m.set(c.id, c.name);
    return m;
  }, [categories]);

  // A stable queue of contact ids to walk, snapshotted when the flow opens so
  // keeps/drops don't reshuffle the deck under the user. Skips re-queue once.
  const [queue, setQueue] = React.useState<string[]>([]);
  const [pos, setPos] = React.useState(0);
  const [lastDropped, setLastDropped] = React.useState<string | null>(null);
  const builtRef = React.useRef(false);
  const dropAckRef = React.useRef(false);

  // Build the queue once per open from the currently-undecided contacts.
  React.useEffect(() => {
    if (!open) {
      builtRef.current = false;
      setQueue([]);
      setPos(0);
      setLastDropped(null);
      return;
    }
    if (builtRef.current || contacts === undefined) return;
    builtRef.current = true;
    const undecided = contacts.filter(
      (c) => !shortlistId || !c.categoryIds.includes(shortlistId),
    );
    setQueue(undecided.map((c) => c.id));
    setPos(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contacts]);

  const contactById = React.useMemo(() => {
    const m = new Map<string, Contact>();
    for (const c of contacts ?? []) m.set(c.id, c);
    return m;
  }, [contacts]);

  // Live counts toward the goal.
  const shortlistedCount = React.useMemo(() => {
    if (!shortlistId) return 0;
    return (contacts ?? []).filter((c) => c.categoryIds.includes(shortlistId))
      .length;
  }, [contacts, shortlistId]);
  const removedCount = removed?.length ?? 0;

  if (!open) return null;

  const current = queue[pos];
  const contact = current ? contactById.get(current) : undefined;
  const done = pos >= queue.length;

  const advance = () => {
    setLastDropped(null);
    setPos((p) => p + 1);
  };

  const keep = async () => {
    if (!current) return;
    const list = await categoriesRepo.findOrCreateShortlist();
    await contactsRepo.addToCategory([current], list.id);
    eventsRepo.log("contact_kept", { ref: current });
    advance();
  };

  const drop = async () => {
    if (!current) return;
    // Honour the data-safety rule: confirm the first removal of the session
    // (it's reversible, and there's an Undo, so we don't nag on every card).
    if (!dropAckRef.current) {
      if (
        typeof window !== "undefined" &&
        !window.confirm(
          "Drop contacts you don't want to keep? They're hidden everywhere and skipped on future imports, but fully reversible from here (Undo) or Settings > Removed contacts.",
        )
      ) {
        return;
      }
      dropAckRef.current = true;
    }
    haptic("warning");
    await contactsRepo.remove([current]);
    setLastDropped(current);
    setPos((p) => p + 1);
  };

  const undoDrop = async () => {
    if (!lastDropped) return;
    haptic("light");
    await contactsRepo.restore([lastDropped]);
    setPos((p) => Math.max(0, p - 1));
    setLastDropped(null);
  };

  const skip = () => {
    haptic("light");
    advance();
  };

  const remaining = queue.length - pos;

  const fields: { icon: LucideIcon; text: string }[] = [];
  if (contact) {
    if (contact.company) fields.push({ icon: Building2, text: contact.company });
    if (contact.designation)
      fields.push({ icon: BriefcaseBusiness, text: contact.designation });
    if (contact.email) fields.push({ icon: Mail, text: contact.email });
  }

  const groupNames = (contact?.categoryIds ?? [])
    .map((id) => categoryName.get(id))
    .filter((n): n is string => Boolean(n));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header + progress */}
      <header className="glass border-b border-border/60 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="section-gradient flex h-9 w-9 items-center justify-center rounded-[0.8rem] shadow-soft ring-1 ring-white/30">
              <ListChecks className="h-5 w-5 text-white" strokeWidth={2.1} />
            </span>
            <div>
              <h1 className="text-lg font-bold leading-tight text-foreground">
                Clean up
              </h1>
              <p className="text-xs text-muted-foreground">
                {shortlistedCount} kept · {removedCount} removed · {remaining} left
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close cleanup"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* No fixed target — this is a list you maintain at your own pace. Keep
            who you want, drop who you don't, and close anytime; what's left
            simply waits for next time. */}
        <p className="mt-2 text-xs text-muted-foreground">
          Keep or drop at your pace — close anytime, the rest waits for later.
        </p>
      </header>

      {/* Card */}
      <div className="flex flex-1 flex-col overflow-y-auto p-4">
        {done ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <PartyPopper className="h-8 w-8" />
            </span>
            <h2 className="text-xl font-bold text-foreground">All reviewed!</h2>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              You&apos;ve gone through everyone in this pass. You kept{" "}
              {shortlistedCount} contact{shortlistedCount === 1 ? "" : "s"} on your
              Shortlist.
            </p>
            <Button className="mt-6" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : !contact ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : (
          <div className="flex flex-1 flex-col">
            <div className="rounded-3xl border border-hairline bg-card p-5 shadow-card">
              <p className="text-2xl font-bold tracking-tight text-foreground [overflow-wrap:anywhere]">
                {contact.fullName || contact.phone}
              </p>
              <p className="mt-0.5 text-base tabular-nums text-muted-foreground">
                {contact.phone}
              </p>

              {fields.length > 0 && (
                <div className="mt-4 space-y-2">
                  {fields.map((f, i) => {
                    const Icon = f.icon;
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-sm text-foreground"
                      >
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="[overflow-wrap:anywhere]">{f.text}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {groupNames.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {groupNames.map((n) => (
                    <span
                      key={n}
                      className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground"
                    >
                      <Tag className="h-3 w-3" />
                      {n}
                    </span>
                  ))}
                </div>
              )}

              {contact.notes && (
                <p className="mt-4 rounded-2xl bg-elevated p-3 text-sm leading-relaxed text-foreground ring-1 ring-inset ring-hairline">
                  {contact.notes}
                </p>
              )}
            </div>

            <p className="mt-3 text-center text-xs text-muted-foreground">
              {pos + 1} of {queue.length}
            </p>

            {/* Undo the last drop, if any. */}
            {lastDropped && (
              <button
                type="button"
                onClick={undoDrop}
                className="mx-auto mt-2 flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-secondary/70"
              >
                <Undo2 className="h-4 w-4" />
                Undo remove
              </button>
            )}
          </div>
        )}
      </div>

      {/* Decision bar */}
      {!done && contact && (
        <div className="glass border-t border-border/60 px-4 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          <div className="grid grid-cols-3 gap-2">
            <HapticButton
              variant="outline"
              haptic="warning"
              className="h-16 flex-col gap-1 text-xs"
              onClick={drop}
            >
              <Trash2 className="h-6 w-6 text-destructive" />
              Drop
            </HapticButton>
            <HapticButton
              variant="outline"
              className="h-16 flex-col gap-1 text-xs"
              onClick={skip}
            >
              <SkipForward className="h-6 w-6" />
              Skip
            </HapticButton>
            <HapticButton
              haptic="success"
              className="h-16 flex-col gap-1 text-xs"
              onClick={keep}
            >
              <Star className="h-6 w-6" />
              Keep
            </HapticButton>
          </div>
        </div>
      )}
    </div>
  );
}
