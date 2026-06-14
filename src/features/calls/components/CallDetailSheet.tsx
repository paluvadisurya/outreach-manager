"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Phone,
  PhoneOff,
  SkipForward,
  Plus,
  X,
  CalendarPlus,
  CalendarClock,
  CalendarDays,
  Trash2,
  MessageCircle,
  Megaphone,
  PhoneCall,
  Ban,
  UserX,
  StickyNote,
  CheckCircle2,
  CircleDashed,
  ArrowUpRight,
  Pencil,
  History,
  Star,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { HapticButton } from "@/components/ui/haptic-button";
import { ExpandableText } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import type { CallOutcome, ContactRating, MessageStatus } from "@/lib/types";
import { contactsRepo } from "@/features/contacts/lib/repository";
import { categoriesRepo } from "@/features/categories/lib/repository";
import { campaignsRepo } from "@/features/campaigns/lib/repository";
import { CampaignCreateSheet } from "@/features/campaigns/components/CampaignCreateSheet";
import { callsRepo } from "../lib/repository";
import { formatCallTime, RATING_META, RATING_ORDER } from "../lib/display";
import { downloadICS } from "../lib/ics";

/** Icon per traffic-light rating, paired with the shared `RATING_META` styling. */
const RATING_ICON: Record<ContactRating, LucideIcon> = {
  connect: PhoneCall,
  no_answer: PhoneOff,
  avoid: Ban,
};

interface CallDetailSheetProps {
  /** Contact id to show, or null to keep the sheet closed. */
  contactId: string | null;
  onClose: () => void;
}

/** Default the next-call picker to tomorrow at 10:00 local time. */
function defaultSchedule(): { date: string; time: string } {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: "10:00",
  };
}

/**
 * Per-outcome presentation shared by the action buttons and the call-log rows.
 * `active` gives each outcome a distinct selected colour so "Skip", "Called" and
 * "Didn't pick" are instantly tellable apart (Req: distinct colours on select).
 */
const OUTCOME_UI: Record<
  Exclude<CallOutcome, "pending">,
  { label: string; icon: LucideIcon; active: string; tint: string }
> = {
  called: {
    label: "Called",
    icon: Phone,
    active: "border-transparent bg-primary text-primary-foreground hover:bg-primary",
    tint: "bg-primary/10 text-primary",
  },
  no_answer: {
    label: "Didn't pick",
    icon: PhoneOff,
    active: "border-transparent bg-amber-500 text-white hover:bg-amber-500",
    tint: "bg-amber-100 text-amber-700",
  },
  skipped: {
    label: "Skip",
    icon: SkipForward,
    active: "border-transparent bg-slate-500 text-white hover:bg-slate-500",
    tint: "bg-secondary text-muted-foreground",
  },
};

const OUTCOME_BUTTONS: Exclude<CallOutcome, "pending">[] = [
  "skipped",
  "called",
  "no_answer",
];

export function CallDetailSheet({ contactId, onClose }: CallDetailSheetProps) {
  const router = useRouter();
  const entry = useLiveQuery(
    () => (contactId ? callsRepo.get(contactId) : undefined),
    [contactId],
  );
  const contact = useLiveQuery(
    () => (contactId ? contactsRepo.get(contactId) : undefined),
    [contactId],
  );
  const campaigns = useLiveQuery(() => campaignsRepo.all(), []) ?? [];
  // The managed Shortlist group, so the header star can show/toggle membership.
  const shortlist = useLiveQuery(() => categoriesRepo.getShortlist(), []);
  const starred = Boolean(
    shortlist && contact?.categoryIds.includes(shortlist.id),
  );

  // Talking-point messages for the campaigns linked to this contact, plus whether
  // each campaign's message has actually been sent (Req #4).
  const talkingPoints = useLiveQuery(async () => {
    if (!contactId || !entry) return [];
    const out: {
      id: string;
      name: string;
      message: string;
      status?: MessageStatus;
      inCampaign: boolean;
    }[] = [];
    for (const cid of entry.campaignIds) {
      const [c, m] = await Promise.all([
        campaignsRepo.get(cid),
        campaignsRepo.messageFor(cid, contactId),
      ]);
      if (c)
        out.push({
          id: cid,
          name: c.name,
          message: m?.message ?? "",
          status: m?.status,
          inCampaign: Boolean(m),
        });
    }
    return out;
  }, [contactId, entry?.campaignIds.join(",")]);

  const [linking, setLinking] = React.useState(false);
  // The per-person "New campaign" action now opens the standard create sheet
  // (pre-attached to this contact) stacked on top of the detail.
  const [createOpen, setCreateOpen] = React.useState(false);
  const [schedule, setSchedule] = React.useState(defaultSchedule);
  const [scheduleNote, setScheduleNote] = React.useState("");
  // Persistent free-form remarks about this person (Req #1), distinct from the
  // per-schedule "what's this call about" note. Backed by CallEntry.notes.
  const [remarks, setRemarks] = React.useState("");
  // Index of the call-log row currently being corrected (inline outcome picker).
  const [editingLog, setEditingLog] = React.useState<number | null>(null);
  // The previous-calls log is collapsed by default — its high-level stat stays
  // visible on the header, the detail unfolds on demand (Req #8).
  const [logOpen, setLogOpen] = React.useState(false);
  // The header trash button opens a small menu offering the two delete kinds
  // (drop from call list vs. remove the contact entirely).
  const [deleteMenuOpen, setDeleteMenuOpen] = React.useState(false);
  // The call log now lives at the bottom; a top shortcut scrolls down to it.
  const callLogRef = React.useRef<HTMLElement>(null);

  const scrollToCallLog = () => {
    haptic("light");
    callLogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Reset transient editor state whenever a different contact opens.
  React.useEffect(() => {
    setLinking(false);
    setCreateOpen(false);
    setSchedule(defaultSchedule());
    setScheduleNote("");
    setEditingLog(null);
    setDeleteMenuOpen(false);
  }, [contactId]);

  // Correct a past log's outcome, then close the inline picker.
  const editLog = (index: number, outcome: CallOutcome) => {
    if (!contactId) return;
    haptic("light");
    void callsRepo.editLog(contactId, index, outcome);
    setEditingLog(null);
  };

  // Delete a past log entry (destructive → confirm, per the data-safety rule).
  const deleteLog = (index: number) => {
    if (!contactId) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm("Delete this call log entry? This can't be undone.")
    ) {
      return;
    }
    haptic("warning");
    void callsRepo.deleteLog(contactId, index);
    setEditingLog(null);
  };

  // Sync the remarks editor when a different contact's entry loads.
  React.useEffect(() => {
    setRemarks(entry?.notes ?? "");
  }, [contactId, entry?.notes]);

  // Persist remarks on blur (avoids a write per keystroke).
  const saveRemarks = () => {
    if (!contactId) return;
    if ((entry?.notes ?? "") === remarks.trim()) return;
    void callsRepo.setNotes(contactId, remarks);
  };

  // Open the campaign at this exact person (Req #4 — the round-trip with #2).
  const openInCampaign = (campaignId: string) => {
    if (!contactId) return;
    haptic("light");
    onClose();
    router.push(
      `/campaigns/${campaignId}?contact=${encodeURIComponent(contactId)}`,
    );
  };

  // Star/unstar this person — a one-tap toggle on the managed Shortlist group.
  // Adding is reversible (tap again), so it stays a quick toggle, mirroring the
  // cleanup-triage "Keep" action rather than gating behind a confirm.
  const toggleStar = async () => {
    if (!contactId) return;
    if (starred && shortlist) {
      haptic("light");
      await contactsRepo.removeFromCategory([contactId], shortlist.id);
    } else {
      haptic("success");
      const list = await categoriesRepo.findOrCreateShortlist();
      await contactsRepo.addToCategory([contactId], list.id);
    }
  };

  const name = contact?.fullName || contact?.phone || "";
  const phone = contact?.phone ?? "";

  const setOutcome = (outcome: CallOutcome) => {
    if (!contactId) return;
    // The outcome buttons are HapticButtons, so the tap itself fires the tick.
    void callsRepo.setOutcome(contactId, outcome);
  };

  // Set the persistent traffic-light rating, or clear it by tapping the active
  // circle again (toggle, mirroring the star). Syncs the managed colour category.
  const setRating = (rating: ContactRating) => {
    if (!contactId) return;
    const next = entry?.rating === rating ? null : rating;
    haptic(next ? "success" : "light");
    void callsRepo.setRating(contactId, next);
  };

  const toggleCampaign = (campaignId: string) => {
    if (!contactId || !entry) return;
    const has = entry.campaignIds.includes(campaignId);
    const next = has
      ? entry.campaignIds.filter((id) => id !== campaignId)
      : [...entry.campaignIds, campaignId];
    void callsRepo.assignCampaigns(contactId, next);
  };

  // A fresh campaign was created for just this contact via the standard create
  // sheet: link it back for talking points and jump straight into it.
  const onCampaignCreated = async (campaignId: string) => {
    if (!contactId) return;
    await callsRepo.addContacts([contactId], [campaignId]);
    setCreateOpen(false);
    onClose();
    router.push(`/campaigns/${campaignId}`);
  };

  const scheduleAt = (): number | null => {
    const ms = new Date(`${schedule.date}T${schedule.time}`).getTime();
    return Number.isNaN(ms) ? null : ms;
  };

  const saveSchedule = (alsoCalendar: boolean) => {
    if (!contactId) return;
    const at = scheduleAt();
    if (at === null) return;
    void callsRepo.scheduleNext(contactId, at, scheduleNote);
    if (alsoCalendar) {
      downloadICS({
        title: `Call ${name}`,
        start: new Date(at),
        description: scheduleNote || phone,
      });
    }
    setScheduleNote("");
  };

  const remove = () => {
    if (!contactId) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Remove ${name || "this contact"} from the call list? Their contact stays in People; this clears their call entry and log.`,
      )
    ) {
      return;
    }
    haptic("warning");
    setDeleteMenuOpen(false);
    void callsRepo.remove(contactId);
    onClose();
  };

  // Remove as a contact entirely (no WhatsApp / out of domain): hides them
  // everywhere and skips them on future imports. Recoverable from Settings.
  const removeContact = async () => {
    if (!contactId) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Remove ${name || "this contact"} entirely? They'll be hidden from all lists and skipped on future imports. Restore from Settings → Removed contacts.`,
      )
    ) {
      return;
    }
    haptic("warning");
    setDeleteMenuOpen(false);
    await contactsRepo.remove([contactId]);
    onClose();
  };

  return (
    <>
    <Sheet
      open={contactId !== null}
      onClose={onClose}
      title={name || "Contact"}
      header={
        contact ? (
          // Name + phone with the star pinned alongside, so the star stays
          // visible no matter how long the name is. The name wraps (never
          // truncates) so no information is lost (Req #2).
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="break-words text-xl font-bold leading-tight tracking-tight text-foreground">
                {name || "Contact"}
              </h2>
              {phone && (
                <p className="mt-1 text-sm leading-snug text-muted-foreground">
                  {phone}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={toggleStar}
              aria-label={starred ? "Remove from Shortlist" : "Add to Shortlist"}
              aria-pressed={starred}
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors",
                starred
                  ? "text-amber-500 hover:bg-amber-500/10"
                  : "text-muted-foreground hover:bg-secondary",
              )}
            >
              <Star
                className={cn("h-5 w-5", starred && "fill-amber-400")}
                strokeWidth={2.1}
              />
            </button>
          </div>
        ) : undefined
      }
      headerAction={
        contact ? (
          // A single Delete control to the left of the close button. Tapping it
          // opens a small native-style menu with the two delete kinds; each kind
          // still confirms before touching stored data (Req #1).
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                haptic("light");
                setDeleteMenuOpen((v) => !v);
              }}
              aria-label="Delete options"
              aria-haspopup="menu"
              aria-expanded={deleteMenuOpen}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                deleteMenuOpen
                  ? "bg-destructive/10 text-destructive"
                  : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
              )}
            >
              <Trash2 className="h-5 w-5" />
            </button>
            {deleteMenuOpen && (
              <>
                <button
                  type="button"
                  aria-hidden
                  tabIndex={-1}
                  onClick={() => setDeleteMenuOpen(false)}
                  className="fixed inset-0 z-40 cursor-default"
                />
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-hairline bg-card p-1.5 shadow-float animate-in fade-in zoom-in-95 duration-150"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={remove}
                    className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-secondary"
                  >
                    <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">
                        Remove from call list
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Keeps the contact; drops this call entry.
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={removeContact}
                    className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-destructive/10"
                  >
                    <UserX className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-destructive">
                        Remove contact entirely
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Hides them everywhere and skips on import.
                      </span>
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        ) : undefined
      }
      footer={
        <div className="space-y-2.5">
          <div className="grid grid-cols-3 gap-2">
            {OUTCOME_BUTTONS.map((o) => {
              const ui = OUTCOME_UI[o];
              const Icon = ui.icon;
              const active = entry?.outcome === o;
              return (
                <HapticButton
                  key={o}
                  variant="outline"
                  haptic={o === "called" ? "success" : "light"}
                  className={cn(
                    "h-14 flex-col gap-1 text-xs",
                    active && ui.active,
                  )}
                  onClick={() => setOutcome(o)}
                >
                  <Icon className="h-5 w-5" />
                  {ui.label}
                </HapticButton>
              );
            })}
          </div>
          <a
            href={phone ? `tel:${phone}` : undefined}
            className="block"
            onClick={() => phone && haptic("medium")}
          >
            <Button className="h-14 w-full text-base" disabled={!phone}>
              <Phone className="h-5 w-5" />
              Call
            </Button>
          </a>
        </div>
      }
    >
      {!entry || !contact ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-5">
          {/* Persistent traffic-light rating — a forward-looking disposition for
              this person (distinct from the per-call outcome buttons below).
              Compact pills: the chosen one gets a soft tint, the rest dim to
              neutral so the pick stands out. Tapping the active pill clears it.
              Mirrors into a managed colour category. */}
          <section className="space-y-2 rounded-2xl border border-hairline bg-card p-2.5 shadow-soft">
            <h3 className="px-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Rating
            </h3>
            <div className="grid grid-cols-3 gap-1.5">
              {RATING_ORDER.map((r) => {
                const meta = RATING_META[r];
                const Icon = RATING_ICON[r];
                const active = entry.rating === r;
                const dimmed = Boolean(entry.rating) && !active;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRating(r)}
                    aria-pressed={active}
                    aria-label={meta.label}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-center transition-all active:scale-[0.98]",
                      active
                        ? meta.active
                        : dimmed
                          ? "border-hairline bg-secondary text-muted-foreground opacity-60"
                          : meta.idle,
                    )}
                  >
                    <Icon className="h-4 w-4" strokeWidth={2.1} />
                    <span className="text-[11px] font-semibold leading-tight">
                      {meta.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Quick shortcut down to the call log, which now sits at the very
              bottom of the sheet under the remove actions (Req #1). */}
          <button
            type="button"
            onClick={scrollToCallLog}
            className="flex w-full items-center justify-between gap-2 rounded-2xl border border-hairline bg-card px-3.5 py-2.5 text-sm font-medium text-foreground shadow-soft transition-colors hover:bg-secondary"
          >
            <span className="flex items-center gap-1.5">
              <History className="h-4 w-4 text-primary" />
              Call log
              {entry.attempts > 0 && (
                <span className="text-xs font-normal text-muted-foreground">
                  · {entry.attempts} attempt{entry.attempts === 1 ? "" : "s"}
                </span>
              )}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>

          {/* Linked campaigns + talking points */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                Campaigns
              </h3>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    haptic("light");
                    setLinking(false);
                    setCreateOpen(true);
                  }}
                  className="flex items-center gap-1 text-sm font-medium text-primary"
                >
                  <Megaphone className="h-4 w-4" />
                  New
                </button>
                <button
                  type="button"
                  onClick={() => setLinking((v) => !v)}
                  className="flex items-center gap-1 text-sm font-medium text-primary"
                >
                  {linking ? (
                    <>
                      <X className="h-4 w-4" />
                      Done
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Link
                    </>
                  )}
                </button>
              </div>
            </div>

            {linking ? (
              campaigns.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No campaigns yet.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {campaigns.map((c) => {
                    const on = entry.campaignIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCampaign(c.id)}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                          on
                            ? "bg-accent text-accent-foreground ring-1 ring-primary/30"
                            : "bg-secondary text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              )
            ) : (talkingPoints?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">
                No campaigns linked. Tap “Link” to attach campaigns and see their
                messages as talking points.
              </p>
            ) : (
              <div className="space-y-3">
                {talkingPoints!.map((tp) => {
                  const sent = tp.status === "sent";
                  return (
                  <div
                    key={tp.id}
                    className="rounded-2xl border border-hairline bg-card p-3 shadow-soft"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {tp.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleCampaign(tp.id)}
                        aria-label={`Unlink ${tp.name}`}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {/* Sent / not-sent status + a jump straight into the campaign
                        at this person (Req #4). */}
                    <div className="mb-2 flex items-center justify-between gap-2">
                      {tp.inCampaign ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                            sent
                              ? "bg-primary/10 text-primary"
                              : "bg-amber-100 text-amber-700",
                          )}
                        >
                          {sent ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Message sent
                            </>
                          ) : (
                            <>
                              <CircleDashed className="h-3.5 w-3.5" />
                              Not sent yet
                            </>
                          )}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          Not in this campaign
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => openInCampaign(tp.id)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-primary hover:bg-secondary/70"
                      >
                        Open in campaign
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {tp.message ? (
                      <div className="rounded-2xl border border-border/60 bg-[#e6ddd3] p-2.5">
                        <div className="max-w-[92%] rounded-2xl rounded-tl-md bg-[#dcf8c6] px-3 py-2 shadow-sm">
                          <ExpandableText
                            text={tp.message}
                            lines={5}
                            className="text-sm leading-relaxed text-[#111b21]"
                            toggleClassName="text-[#075e54]"
                            moreLabel="Show more"
                          />
                        </div>
                      </div>
                    ) : (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MessageCircle className="h-3.5 w-3.5" />
                        This contact isn’t in that campaign’s message list.
                      </p>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Schedule next call */}
          <section className="space-y-2 rounded-2xl border border-hairline bg-card p-3 shadow-soft">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <CalendarClock className="h-4 w-4 text-primary" />
                Next call
              </h3>
              {/* Jump to the full Calendar to see this person in context (Req #8). */}
              <button
                type="button"
                onClick={() => {
                  haptic("light");
                  onClose();
                  router.push("/calendar");
                }}
                className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-secondary/70 active:scale-95"
              >
                <CalendarDays className="h-3.5 w-3.5 text-primary" />
                Calendar
              </button>
            </div>

            {entry.nextCallAt ? (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-accent px-3 py-2 text-sm text-accent-foreground">
                <span className="min-w-0">
                  <span className="block font-medium">
                    {formatCallTime(entry.nextCallAt)}
                  </span>
                  {entry.nextCallNote && (
                    <span className="block truncate text-xs">
                      {entry.nextCallNote}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => contactId && callsRepo.clearNext(contactId)}
                  aria-label="Clear scheduled call"
                  className="shrink-0 text-accent-foreground/70 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <p className="rounded-xl bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
                No upcoming call scheduled.
              </p>
            )}

            <div className="flex gap-2">
              <input
                type="date"
                value={schedule.date}
                onChange={(e) =>
                  setSchedule((s) => ({ ...s, date: e.target.value }))
                }
                className="min-h-touch flex-1 rounded-2xl border border-hairline bg-card px-3.5 text-base text-foreground shadow-soft transition-all focus-visible:border-ring/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/15"
              />
              <input
                type="time"
                value={schedule.time}
                onChange={(e) =>
                  setSchedule((s) => ({ ...s, time: e.target.value }))
                }
                className="min-h-touch rounded-2xl border border-hairline bg-card px-3.5 text-base text-foreground shadow-soft transition-all focus-visible:border-ring/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/15"
              />
            </div>
            <input
              type="text"
              value={scheduleNote}
              onChange={(e) => setScheduleNote(e.target.value)}
              placeholder="What's this call about? (optional)"
              className="min-h-touch w-full rounded-2xl border border-hairline bg-card px-3.5 text-base text-foreground shadow-soft transition-all focus-visible:border-ring/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/15 placeholder:text-muted-foreground"
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => saveSchedule(false)}
              >
                Save
              </Button>
              <Button className="flex-1" onClick={() => saveSchedule(true)}>
                <CalendarPlus className="h-4 w-4" />
                Save + Calendar
              </Button>
            </div>
            <p className="px-1 text-xs text-muted-foreground">
              “Save + Calendar” downloads an event you can open in the iOS Calendar
              to confirm and add.
            </p>
          </section>

          {/* Persistent remarks — free-form notes that stick with this person,
              separate from any single scheduled call (Req #1). */}
          <section className="space-y-2 rounded-2xl border border-hairline bg-card p-3 shadow-soft">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <StickyNote className="h-4 w-4 text-primary" />
              Remarks
            </h3>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              onBlur={saveRemarks}
              placeholder="Notes about this person: context, preferences, history…"
              rows={3}
              className="w-full resize-none rounded-2xl border border-hairline bg-card px-3.5 py-2.5 text-base leading-relaxed text-foreground shadow-soft transition-all focus-visible:border-ring/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/15 placeholder:text-muted-foreground"
            />
          </section>

          {/* Call log — every logged call for this person over time, newest
              first. Sits at the bottom (Req #1); the top shortcut scrolls here.
              Each entry is correctable (mis-tapped outcome) or deletable so the
              history stays clean and analytics stay accurate. */}
          <section
            ref={callLogRef}
            className="scroll-mt-2 space-y-2 rounded-2xl border border-hairline bg-card p-3 shadow-soft"
          >
            <button
              type="button"
              onClick={() => entry.history.length > 0 && setLogOpen((o) => !o)}
              aria-expanded={logOpen}
              disabled={entry.history.length === 0}
              className="flex w-full items-center justify-between gap-2 text-left disabled:cursor-default"
            >
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <History className="h-4 w-4 text-primary" />
                Past calls
              </h3>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {entry.history.length > 0
                  ? `${entry.history.length} logged · ${entry.attempts} attempt${entry.attempts === 1 ? "" : "s"}`
                  : "None yet"}
                {entry.history.length > 0 && (
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform",
                      logOpen && "rotate-180",
                    )}
                  />
                )}
              </span>
            </button>

            {entry.history.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No calls logged yet. Use the buttons below after you call.
              </p>
            ) : logOpen ? (
              <ul className="space-y-1.5">
                {entry.history
                  .map((h, index) => ({ ...h, index }))
                  .slice()
                  .reverse()
                  .map((h) => {
                    const ui = OUTCOME_UI[h.outcome as keyof typeof OUTCOME_UI];
                    if (!ui) return null;
                    const LogIcon = ui.icon;
                    const editing = editingLog === h.index;
                    return (
                      <li
                        key={`${h.at}-${h.index}`}
                        className="rounded-xl bg-elevated px-2.5 py-2 ring-1 ring-inset ring-hairline"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                              ui.tint,
                            )}
                          >
                            <LogIcon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-foreground">
                              {ui.label}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {formatCallTime(h.at)}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setEditingLog(editing ? null : h.index)
                            }
                            aria-label={editing ? "Cancel edit" : "Edit log"}
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary",
                              editing && "bg-secondary text-foreground",
                            )}
                          >
                            {editing ? (
                              <X className="h-4 w-4" />
                            ) : (
                              <Pencil className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteLog(h.index)}
                            aria-label="Delete log"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        {editing && (
                          <div className="mt-2 grid grid-cols-3 gap-1.5">
                            {OUTCOME_BUTTONS.map((o) => {
                              const oui = OUTCOME_UI[o];
                              const OIcon = oui.icon;
                              const on = h.outcome === o;
                              return (
                                <button
                                  key={o}
                                  type="button"
                                  onClick={() => editLog(h.index, o)}
                                  className={cn(
                                    "flex items-center justify-center gap-1 rounded-lg border px-1.5 py-1.5 text-xs font-medium transition-colors",
                                    on
                                      ? oui.active
                                      : "border-hairline bg-card text-muted-foreground hover:bg-secondary",
                                  )}
                                >
                                  <OIcon className="h-3.5 w-3.5" />
                                  {oui.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </li>
                    );
                  })}
              </ul>
            ) : null}
          </section>
        </div>
      )}
    </Sheet>

    {/* Standard New-Campaign flow, pre-attached to this person and stacked on
        top of the detail so cancelling returns here. */}
    <CampaignCreateSheet
      open={createOpen}
      onClose={() => setCreateOpen(false)}
      onCreated={onCampaignCreated}
      contactIds={contactId ? [contactId] : []}
    />
    </>
  );
}
