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
  Trash2,
  MessageCircle,
  Megaphone,
  ChevronRight,
  UserX,
} from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ExpandableText } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import type { CallOutcome } from "@/lib/types";
import { contactsRepo } from "@/features/contacts/lib/repository";
import { campaignsRepo } from "@/features/campaigns/lib/repository";
import { templatesRepo } from "@/features/templates/lib/repository";
import { callsRepo } from "../lib/repository";
import { formatCallTime } from "../lib/display";
import { downloadICS } from "../lib/ics";

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

const OUTCOME_BUTTONS: {
  outcome: CallOutcome;
  label: string;
  icon: typeof Phone;
}[] = [
  { outcome: "skipped", label: "Skip", icon: SkipForward },
  { outcome: "called", label: "Called", icon: Phone },
  { outcome: "no_answer", label: "Didn't pick", icon: PhoneOff },
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
  const templates = useLiveQuery(() => templatesRepo.all(), []) ?? [];

  // Talking-point messages for the campaigns linked to this contact.
  const talkingPoints = useLiveQuery(async () => {
    if (!contactId || !entry) return [];
    const out: { id: string; name: string; message: string }[] = [];
    for (const cid of entry.campaignIds) {
      const [c, m] = await Promise.all([
        campaignsRepo.get(cid),
        campaignsRepo.messageFor(cid, contactId),
      ]);
      if (c) out.push({ id: cid, name: c.name, message: m?.message ?? "" });
    }
    return out;
  }, [contactId, entry?.campaignIds.join(",")]);

  const [linking, setLinking] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [creatingBusy, setCreatingBusy] = React.useState(false);
  const [schedule, setSchedule] = React.useState(defaultSchedule);
  const [scheduleNote, setScheduleNote] = React.useState("");

  // Reset transient editor state whenever a different contact opens.
  React.useEffect(() => {
    setLinking(false);
    setCreating(false);
    setSchedule(defaultSchedule());
    setScheduleNote("");
  }, [contactId]);

  const name = contact?.fullName || contact?.phone || "";
  const phone = contact?.phone ?? "";

  const setOutcome = (outcome: CallOutcome) => {
    if (!contactId) return;
    haptic(outcome === "called" ? "success" : "light");
    void callsRepo.setOutcome(contactId, outcome);
  };

  const toggleCampaign = (campaignId: string) => {
    if (!contactId || !entry) return;
    const has = entry.campaignIds.includes(campaignId);
    const next = has
      ? entry.campaignIds.filter((id) => id !== campaignId)
      : [...entry.campaignIds, campaignId];
    void callsRepo.assignCampaigns(contactId, next);
  };

  // Spin up a fresh campaign for just this contact from the chosen template,
  // link it back for talking points, and jump straight into it.
  const createCampaign = async (templateId: string, templateName: string) => {
    if (!contactId || creatingBusy) return;
    setCreatingBusy(true);
    try {
      const campaign = await campaignsRepo.create({
        name: `${name || phone} · ${templateName}`,
        templateId,
        contactIds: [contactId],
      });
      await callsRepo.addContacts([contactId], [campaign.id]);
      setCreating(false);
      onClose();
      router.push(`/campaigns/${campaign.id}`);
    } finally {
      setCreatingBusy(false);
    }
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
    if (contactId) void callsRepo.remove(contactId);
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
    await contactsRepo.remove([contactId]);
    onClose();
  };

  return (
    <Sheet
      open={contactId !== null}
      onClose={onClose}
      title={name || "Contact"}
      description={phone || undefined}
      footer={
        <div className="space-y-2.5">
          <div className="grid grid-cols-3 gap-2">
            {OUTCOME_BUTTONS.map((b) => {
              const Icon = b.icon;
              const active = entry?.outcome === b.outcome;
              return (
                <Button
                  key={b.outcome}
                  variant={active ? "default" : "outline"}
                  className="h-14 flex-col gap-1 text-xs"
                  onClick={() => setOutcome(b.outcome)}
                >
                  <Icon className="h-5 w-5" />
                  {b.label}
                </Button>
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
          {/* Attempt summary */}
          {(entry.attempts > 0 || entry.lastOutcomeAt) && (
            <p className="text-sm text-muted-foreground">
              {entry.attempts} attempt{entry.attempts === 1 ? "" : "s"}
              {entry.lastOutcomeAt
                ? ` · last ${formatCallTime(entry.lastOutcomeAt)}`
                : ""}
            </p>
          )}

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
                    setCreating((v) => !v);
                    setLinking(false);
                  }}
                  className="flex items-center gap-1 text-sm font-medium text-primary"
                >
                  {creating ? (
                    <>
                      <X className="h-4 w-4" />
                      Done
                    </>
                  ) : (
                    <>
                      <Megaphone className="h-4 w-4" />
                      New
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLinking((v) => !v);
                    setCreating(false);
                  }}
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

            {creating && (
              <div className="space-y-2 rounded-2xl border border-primary/20 bg-accent/40 p-2.5">
                <p className="px-1 text-xs text-muted-foreground">
                  Pick a template to start a campaign for {name || "this contact"}.
                </p>
                {templates.length === 0 ? (
                  <p className="px-1 py-2 text-sm text-muted-foreground">
                    No templates yet. Create one from the Templates tab.
                  </p>
                ) : (
                  templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      disabled={creatingBusy}
                      onClick={() => createCampaign(t.id, t.name)}
                      className="flex w-full items-center gap-2 rounded-xl border border-hairline bg-card px-3 py-2.5 text-left transition-colors hover:bg-secondary disabled:opacity-50"
                    >
                      <Megaphone className="h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                        {t.name}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))
                )}
              </div>
            )}

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
                {talkingPoints!.map((tp) => (
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
                ))}
              </div>
            )}
          </section>

          {/* Schedule next call */}
          <section className="space-y-2 rounded-2xl border border-hairline bg-card p-3 shadow-soft">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <CalendarClock className="h-4 w-4 text-primary" />
              Next call
            </h3>

            {entry.nextCallAt && (
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

          <div className="space-y-2">
            <button
              type="button"
              onClick={remove}
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
              Remove from call list
            </button>
            <button
              type="button"
              onClick={removeContact}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 py-3 text-sm font-semibold text-destructive hover:bg-destructive/10"
            >
              <UserX className="h-4 w-4" />
              Remove contact entirely
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
