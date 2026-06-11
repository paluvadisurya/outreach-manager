"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Phone,
  PhoneForwarded,
  Check,
  SkipForward,
  AlertTriangle,
  Eye,
  RefreshCw,
  MoreVertical,
  Pencil,
  RotateCcw,
  Trash2,
  Star,
  Plus,
  Link2,
  UserMinus,
  UserPlus,
  UserX,
  FolderMinus,
  Users,
  CircleMinus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HapticButton } from "@/components/ui/haptic-button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Sheet } from "@/components/ui/sheet";
import { ExpandableText } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { nextDeepLinkTarget } from "@/lib/deep-link";
import { haptic } from "@/lib/haptics";
import type { CampaignMessage, MessageStatus } from "@/lib/types";
import { templatesRepo } from "@/features/templates/lib/repository";
import { categoriesRepo } from "@/features/categories/lib/repository";
import { contactsRepo } from "@/features/contacts/lib/repository";
import { callsRepo } from "@/features/calls/lib/repository";
import { eventsRepo } from "@/features/analytics/lib/repository";
import { useSettings } from "@/features/settings/hooks/useSettings";
import { campaignsRepo } from "../lib/repository";
import { computeProgress, resumeIndex } from "../lib/progress";
import { buildWaLink, openWhatsApp } from "../lib/whatsapp";
import { AddPeopleToCampaignSheet } from "./AddPeopleToCampaignSheet";

const STATUS_META: Record<MessageStatus, { label: string; variant: "success" | "secondary" | "destructive" | "default" }> = {
  pending: { label: "Pending", variant: "secondary" },
  sent: { label: "Sent", variant: "success" },
  skipped: { label: "Skipped", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
  needs_review: { label: "Needs review", variant: "default" },
};

export function SendingQueue({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Deep-link target: jump the queue straight to this person on load (Req #4 —
  // the round-trip back from the Call section's "Open in campaign").
  const focusContactId = searchParams.get("contact");
  const settings = useSettings();

  const campaign = useLiveQuery(() => campaignsRepo.get(campaignId), [campaignId]);
  const messages = useLiveQuery(
    () => campaignsRepo.messagesFor(campaignId),
    [campaignId],
  );
  const templates = useLiveQuery(() => templatesRepo.all(), []) ?? [];
  const sourceCategories = useLiveQuery(async () => {
    const c = await campaignsRepo.get(campaignId);
    if (!c?.categoryIds.length) return [];
    const cats = await Promise.all(c.categoryIds.map((id) => categoriesRepo.get(id)));
    return cats.filter((x): x is NonNullable<typeof x> => Boolean(x));
  }, [campaignId]);

  const [index, setIndex] = React.useState(0);
  // Whether the person currently in focus is already on the call list, so the
  // "Add to call list" button can reflect state (Req 5).
  const onCallList = useLiveQuery(async () => {
    if (!messages || messages.length === 0) return false;
    const cur = messages[Math.min(index, messages.length - 1)];
    if (!cur) return false;
    return Boolean(await callsRepo.get(cur.contactId));
  }, [messages, index]);

  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [reviewFilter, setReviewFilter] = React.useState<MessageStatus | "all">(
    "all",
  );
  const [manageOpen, setManageOpen] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState("");
  const [addTemplateOpen, setAddTemplateOpen] = React.useState(false);
  const [addPeopleOpen, setAddPeopleOpen] = React.useState(false);
  const [personMenuOpen, setPersonMenuOpen] = React.useState(false);
  // The review-list row whose remove options are open (Req 1 follow-up).
  const [reviewRemoveTarget, setReviewRemoveTarget] =
    React.useState<CampaignMessage | null>(null);
  const initialized = React.useRef(false);
  // The `?contact=` deep-link target we last jumped to (keyed on value, not
  // mount), so a changed target on a reused screen still re-focuses the queue.
  const handledContact = React.useRef<string | null>(null);

  const templateName = React.useCallback(
    (id: string) => templates.find((t) => t.id === id)?.name ?? "Template",
    [templates],
  );

  const openReview = (filter: MessageStatus | "all") => {
    setReviewFilter(filter);
    setReviewOpen(true);
  };

  // Jump to a deep-linked contact whenever the `?contact=` target changes (not
  // just once per mount — Next.js can reuse this subtree across a soft
  // navigation, which would otherwise pin the queue to the previous person),
  // else on first load resume exactly where the user left off.
  React.useEffect(() => {
    if (!campaign || !messages) return;
    const target = nextDeepLinkTarget(handledContact.current, focusContactId);
    if (target) {
      const focused = messages.findIndex((m) => m.contactId === target);
      if (focused !== -1) {
        handledContact.current = target;
        initialized.current = true;
        setIndex(focused);
        return;
      }
    }
    if (!initialized.current) {
      initialized.current = true;
      setIndex(resumeIndex(messages, campaign.currentIndex));
    }
  }, [campaign, messages, focusContactId]);

  const persistIndex = React.useCallback(
    (next: number) => {
      setIndex(next);
      void campaignsRepo.setIndex(campaignId, next);
    },
    [campaignId],
  );

  const goTo = (next: number) => {
    if (!messages) return;
    const clamped = Math.min(Math.max(0, next), messages.length - 1);
    persistIndex(clamped);
  };

  const mark = async (status: MessageStatus) => {
    if (!messages) return;
    const current = messages[index];
    if (!current) return;
    // The action buttons are HapticButtons, so the tap itself fires the tick.
    // Record the outcome for cross-day analytics (only the meaningful, terminal
    // states — pending/needs_review are working states, not activity).
    if (status === "sent" || status === "skipped" || status === "failed") {
      eventsRepo.log(`message_${status}`, {
        ref: current.contactId,
        campaignId,
        templateId: current.templateId,
      });
    }
    await campaignsRepo.setMessageStatus(current.id, status);

    // Advance to the next message that still needs attention; if none remain
    // ahead, just step forward so the user can review the tail.
    const fresh = messages.map((m, i) =>
      i === index ? { ...m, status } : m,
    );
    let next = -1;
    for (let i = index + 1; i < fresh.length; i++) {
      const s = fresh[i]?.status;
      if (s === "pending" || s === "needs_review") {
        next = i;
        break;
      }
    }
    persistIndex(next === -1 ? Math.min(index + 1, messages.length - 1) : next);
    await campaignsRepo.syncCompletion(campaignId);
  };

  // One-tap Refresh (Req #5): reconcile the contact set with its source AND
  // re-render every message from the current templates/contact data/settings,
  // keeping progress. Replaces the old Pause/Resume control. Confirmed because it
  // rewrites stored message text and can add/remove people.
  const [refreshing, setRefreshing] = React.useState(false);
  const refreshAll = async () => {
    if (refreshing) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Refresh this campaign? It pulls the latest contacts from the source and re-renders every message with the current templates. Your progress is kept.",
      )
    ) {
      return;
    }
    setRefreshing(true);
    haptic("light");
    try {
      const { added, removed } = await campaignsRepo.refreshContacts(campaignId);
      await campaignsRepo.regenerate(campaignId);
      if (typeof window !== "undefined") {
        window.alert(
          added === 0 && removed === 0
            ? "Refreshed: messages re-rendered, contacts already up to date."
            : `Refreshed: messages re-rendered, ${added} added, ${removed} removed.`,
        );
      }
    } finally {
      setRefreshing(false);
    }
  };

  const regenerate = async () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Re-render all messages with the current template and settings? Your progress is kept.",
      )
    ) {
      return;
    }
    await campaignsRepo.regenerate(campaignId);
  };

  const refreshContacts = async () => {
    setManageOpen(false);
    const { added, removed } = await campaignsRepo.refreshContacts(campaignId);
    if (typeof window !== "undefined") {
      window.alert(
        added === 0 && removed === 0
          ? "Already up to date, no contacts added or removed."
          : `Contacts refreshed: ${added} added, ${removed} removed.`,
      );
    }
  };

  // Switch the current person's message to a different (attached) template.
  const switchTemplate = async (templateId: string) => {
    if (!messages) return;
    const current = messages[Math.min(index, messages.length - 1)];
    if (!current || current.templateId === templateId) return;
    haptic("light");
    await campaignsRepo.setMessageTemplate(campaignId, current.contactId, templateId);
  };

  const attachTemplate = async (templateId: string) => {
    await campaignsRepo.addTemplate(campaignId, templateId);
    setAddTemplateOpen(false);
  };

  // Reset just the current person back to Pending (Req 2).
  const resetCurrent = async () => {
    if (!messages) return;
    const current = messages[Math.min(index, messages.length - 1)];
    if (!current) return;
    await campaignsRepo.setMessageStatus(current.id, "pending");
  };

  // Remove the current person from this campaign's queue only.
  const removeFromCampaign = async () => {
    if (!messages) return;
    const current = messages[Math.min(index, messages.length - 1)];
    if (!current) return;
    setPersonMenuOpen(false);
    await campaignsRepo.removeMessage(campaignId, current.contactId);
    setIndex((i) => Math.max(0, Math.min(i, messages.length - 2)));
  };

  // Strip the current person from a source category (future lists exclude them)
  // and drop them from this campaign's queue too.
  const removeFromCategory = async (categoryId: string) => {
    if (!messages) return;
    const current = messages[Math.min(index, messages.length - 1)];
    if (!current) return;
    setPersonMenuOpen(false);
    await contactsRepo.removeFromCategory([current.contactId], categoryId);
    await campaignsRepo.removeMessage(campaignId, current.contactId);
    setIndex((i) => Math.max(0, Math.min(i, messages.length - 2)));
  };

  // Remove the current person as a contact entirely (no WhatsApp / wrong number):
  // hide them everywhere, skip them on future imports, and drop them here too.
  const removeContactEntirely = async () => {
    if (!messages) return;
    const current = messages[Math.min(index, messages.length - 1)];
    if (!current) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Remove ${current.contactName} entirely? They'll be hidden from all lists and skipped on future imports. You can restore them from Settings → Removed contacts.`,
      )
    ) {
      return;
    }
    setPersonMenuOpen(false);
    haptic("warning");
    await contactsRepo.remove([current.contactId]);
    await campaignsRepo.removeMessage(campaignId, current.contactId);
    setIndex((i) => Math.max(0, Math.min(i, messages.length - 2)));
  };

  // Add the person in focus to the call list, linking this campaign so its
  // message shows up there as a talking point (Req 5). Idempotent.
  const addCurrentToCallList = async () => {
    if (!messages) return;
    const cur = messages[Math.min(index, messages.length - 1)];
    if (!cur) return;
    haptic("light");
    await callsRepo.addContacts([cur.contactId], [campaignId]);
  };

  // Jump from the campaign to this person's view in the Call section (Req #2).
  // If they're not on the call list yet, ask before adding — then open them.
  const viewInCallList = async () => {
    if (!messages) return;
    const cur = messages[Math.min(index, messages.length - 1)];
    if (!cur) return;
    if (!onCallList) {
      if (
        typeof window !== "undefined" &&
        !window.confirm(
          `${cur.contactName} isn't on your call list yet. Add them and open their call view?`,
        )
      ) {
        return;
      }
      await callsRepo.addContacts([cur.contactId], [campaignId]);
    }
    haptic("light");
    // Pin the queue to this person so the position is coherent if we resume by
    // index later, and carry the contact in the return origin so closing the
    // call view brings the campaign back to THIS exact person (identity-stable),
    // never whichever message the stored index happens to resolve to.
    persistIndex(Math.min(index, messages.length - 1));
    const back = `/campaigns/${campaignId}?contact=${encodeURIComponent(cur.contactId)}`;
    router.push(
      `/call?contact=${encodeURIComponent(cur.contactId)}&from=${encodeURIComponent(back)}`,
    );
  };

  // From the review list's remove options (Req 1): drop the person from this
  // campaign's queue only — their group membership and contact record stay.
  const removeReviewFromCampaign = async () => {
    const target = reviewRemoveTarget;
    if (!target || !messages) return;
    setReviewRemoveTarget(null);
    haptic("warning");
    await campaignsRepo.removeMessage(campaignId, target.contactId);
    setIndex((i) => Math.max(0, Math.min(i, messages.length - 2)));
  };

  // From the review list's remove options (Req 1): remove the person as a contact
  // entirely — hidden everywhere, skipped on future imports, dropped from here.
  const removeReviewContactEntirely = async () => {
    const target = reviewRemoveTarget;
    if (!target || !messages) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Remove ${target.contactName} entirely? They'll be hidden from all lists and skipped on future imports. Restore from Settings → Removed contacts.`,
      )
    ) {
      return;
    }
    setReviewRemoveTarget(null);
    haptic("warning");
    await contactsRepo.remove([target.contactId]);
    await campaignsRepo.removeMessage(campaignId, target.contactId);
    setIndex((i) => Math.max(0, Math.min(i, messages.length - 2)));
  };

  const openManage = () => {
    setNameDraft(campaign?.name ?? "");
    setRenaming(false);
    setManageOpen(true);
  };

  const saveRename = async () => {
    const next = nameDraft.trim();
    if (next && next !== campaign?.name) {
      await campaignsRepo.rename(campaignId, next);
    }
    setRenaming(false);
  };

  const resetProgress = async () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Reset this campaign? Every message goes back to Pending and the queue rewinds to the start. The message text is kept.",
      )
    ) {
      return;
    }
    await campaignsRepo.resetProgress(campaignId);
    setIndex(0);
    setManageOpen(false);
  };

  const remove = async () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Delete this campaign for good? Its messages and progress will be removed. This can't be undone.",
      )
    ) {
      return;
    }
    await campaignsRepo.delete(campaignId);
    router.push("/campaigns");
  };

  if (!campaign || !messages) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  if (messages.length === 0) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => router.push("/campaigns")}>
          <ArrowLeft className="h-5 w-5" />
          Back
        </Button>
        <p className="mt-6 text-center text-muted-foreground">
          This campaign has no contacts.
        </p>
      </div>
    );
  }

  const progress = computeProgress(messages);
  const current = messages[Math.min(index, messages.length - 1)]!;
  // Manual universal-link fallback (opt-in; the Send button already auto-falls
  // back to wa.me on its own when a native app doesn't open).
  const waFallbackLink = buildWaLink(current.phone, current.message, "wa_me");
  const showFallback = settings.showWaMeFallback;
  const statusMeta = STATUS_META[current.status];
  const isFinal =
    current.status === "sent" ||
    current.status === "skipped" ||
    current.status === "failed";
  // Templates not yet attached to this campaign (for the "Add template" picker).
  const attachableTemplates = templates.filter(
    (t) => !campaign.templateIds.includes(t.id),
  );

  // Per-status buckets shown as live stat chips in the header. Tapping any chip
  // opens the review sheet filtered to that bucket so the user can see exactly
  // who is in each (Sent / Pending / Review / Skipped / Failed).
  const buckets: {
    key: MessageStatus;
    label: string;
    count: number;
    tone: string;
  }[] = [
    { key: "sent", label: "Sent", count: progress.sent, tone: "text-primary" },
    {
      key: "pending",
      label: "Pending",
      count: progress.pending,
      tone: "text-foreground",
    },
    {
      key: "needs_review",
      label: "Review",
      count: progress.needsReview,
      tone: "text-amber-600",
    },
    {
      key: "skipped",
      label: "Skipped",
      count: progress.skipped,
      tone: "text-muted-foreground",
    },
    {
      key: "failed",
      label: "Failed",
      count: progress.failed,
      tone: "text-destructive",
    },
  ];

  const reviewList =
    reviewFilter === "all"
      ? messages
      : messages.filter((m) => m.status === reviewFilter);

  const jumpTo = (message: CampaignMessage) => {
    const target = messages.findIndex((m) => m.id === message.id);
    if (target !== -1) goTo(target);
    setReviewOpen(false);
  };

  return (
    <div className="flex h-dvh flex-col">
      {/* Header with campaign progress */}
      <header className="glass sticky top-0 z-30 border-b border-border/60 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/campaigns")}
            aria-label="Back to campaigns"
            className="-ml-2"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-semibold text-foreground">
              {campaign.name}
            </h1>
            <p className="text-xs text-muted-foreground">
              {progress.processed} of {progress.total} done · {progress.percent}%
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={refreshing}
            aria-label="Refresh contacts and messages"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            Refresh
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={openManage}
            aria-label="Manage campaign"
          >
            <MoreVertical className="h-5 w-5" />
          </Button>
        </div>
        <div className="mt-2">
          <ProgressBar value={progress.fraction} />
        </div>

        {/* Live action stats — each chip opens the message list filtered to it. */}
        <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto">
          {buckets.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => openReview(b.key)}
              className="flex min-w-[58px] flex-1 flex-col items-center rounded-2xl bg-elevated px-2 py-2 ring-1 ring-inset ring-hairline transition-all hover:bg-secondary active:scale-[0.97]"
            >
              <span className={`text-base font-bold tabular-nums ${b.tone}`}>
                {b.count}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {b.label}
              </span>
            </button>
          ))}
        </div>
      </header>

      {/* Current message card */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {index + 1} of {messages.length}
          </span>
          <div className="flex items-center gap-1.5">
            <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
            {/* Per-person reset — only when this person is already processed. */}
            {isFinal && (
              <button
                type="button"
                onClick={resetCurrent}
                className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-secondary/70"
                aria-label="Reset this person to pending"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            )}
            <button
              type="button"
              onClick={() => setPersonMenuOpen(true)}
              aria-label="Person options"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Template picker sits ABOVE the message so the action buttons below
            stay at a constant position as you move between people (Req 2). Only
            shown when the campaign carries more than one template — tap a chip to
            re-render THIS person's message from that template. */}
        {campaign.templateIds.length > 1 && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Template for this person
            </p>
            {/* Vertical padding (with matching negative margin) gives the active
                chip's ring room so it isn't clipped by the horizontal scroller. */}
            <div className="no-scrollbar -my-1 flex gap-1.5 overflow-x-auto px-0.5 py-1">
              {campaign.templateIds.map((tid) => {
                const active = current.templateId === tid;
                const isPrimary = campaign.primaryTemplateId === tid;
                return (
                  <button
                    key={tid}
                    type="button"
                    onClick={() => switchTemplate(tid)}
                    className={cn(
                      "flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors",
                      active
                        ? "bg-accent text-accent-foreground ring-1 ring-primary/30"
                        : "bg-secondary text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {isPrimary && (
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                    )}
                    <span className="max-w-[10rem] truncate">{templateName(tid)}</span>
                    {active && <Check className="h-3.5 w-3.5 text-primary" />}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setAddTemplateOpen(true)}
                className="flex shrink-0 items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </div>
          </div>
        )}
        {campaign.templateIds.length <= 1 && (
          <button
            type="button"
            onClick={() => setAddTemplateOpen(true)}
            className="mt-3 flex items-center gap-1 text-sm font-semibold text-primary"
          >
            <Plus className="h-4 w-4" />
            Add another template
          </button>
        )}

        <div className="mt-3 rounded-3xl border border-hairline bg-card p-4 shadow-card">
          <p className="text-lg font-bold tracking-tight text-foreground">
            {current.contactName}
          </p>
          <p className="text-sm text-muted-foreground">{current.phone}</p>
          <div className="mt-3 rounded-2xl border border-border/60 bg-[#e6ddd3] p-3">
            <div className="ml-auto max-w-[92%] rounded-2xl rounded-tr-md bg-[#dcf8c6] px-3.5 py-2.5 shadow-sm">
              <ExpandableText
                text={current.message}
                lines={6}
                className="text-[13px] leading-relaxed text-[#111b21]"
                toggleClassName="text-[#075e54]"
              />
            </div>
          </div>
        </div>

        {/* Tie messaging to the call list — drop this person onto it so their
            message rides along as a talking point (Req 5), and jump straight to
            their call view (Req 2). */}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={addCurrentToCallList}
            disabled={Boolean(onCallList)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-2xl border py-3 text-sm font-semibold transition-colors",
              onCallList
                ? // Already added — muted, clearly a settled/done state.
                  "border-border/60 bg-secondary/40 text-muted-foreground"
                : // Actionable — subtly highlighted so it stands apart from "added".
                  "border-primary/30 bg-accent/60 text-accent-foreground hover:bg-accent",
            )}
          >
            {onCallList ? (
              <>
                <Check className="h-4 w-4 text-primary" />
                On your call list
              </>
            ) : (
              <>
                <Phone className="h-4 w-4 text-primary" />
                Add to call list
              </>
            )}
          </button>
          <button
            type="button"
            onClick={viewInCallList}
            aria-label="Open this person's call view"
            className="flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-hairline bg-card px-4 py-3 text-sm font-semibold text-foreground shadow-soft transition-colors hover:bg-secondary active:scale-[0.99]"
          >
            <PhoneForwarded className="h-4 w-4 text-primary" />
            Call view
          </button>
        </div>

        {/* Secondary marks — compact, one row, out of the primary thumb path */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <HapticButton
            variant="outline"
            className="h-14 flex-col gap-1 text-xs"
            onClick={() => mark("skipped")}
          >
            <SkipForward className="h-5 w-5" />
            Skip
          </HapticButton>
          <HapticButton
            variant="outline"
            className="h-14 flex-col gap-1 text-xs"
            onClick={() => mark("needs_review")}
          >
            <Eye className="h-5 w-5" />
            Review
          </HapticButton>
          <HapticButton
            variant="outline"
            className="h-14 flex-col gap-1 text-xs"
            onClick={() => mark("failed")}
          >
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Failed
          </HapticButton>
        </div>
      </div>

      {/* Sticky primary actions, sized and lifted for easy thumb reach */}
      <div className="glass sticky bottom-0 border-t border-border/60 px-4 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+1.75rem)]">
        {/* Navigation row */}
        <div className="mb-2.5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            className="flex h-10 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-muted-foreground hover:bg-secondary disabled:opacity-40"
          >
            <ChevronLeft className="h-5 w-5" />
            Prev
          </button>
          <span className="text-sm font-medium text-muted-foreground">
            {index + 1} / {messages.length}
          </span>
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            disabled={index >= messages.length - 1}
            className="flex h-10 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-muted-foreground hover:bg-secondary disabled:opacity-40"
          >
            Next
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Two large primary actions — the core send loop */}
        <div className="grid grid-cols-2 gap-3">
          <HapticButton
            className="h-14 w-full text-base"
            variant="outline"
            onClick={() =>
              openWhatsApp(current.phone, current.message, settings.whatsappApp)
            }
          >
            <MessageCircle className="h-5 w-5 text-primary" />
            WhatsApp
          </HapticButton>
          {isFinal ? (
            <HapticButton
              className="h-14 w-full text-base"
              variant="outline"
              onClick={resetCurrent}
              aria-label="Reset this person"
            >
              <RotateCcw className="h-5 w-5" />
              {current.status === "sent" ? "Sent · Reset" : "Done · Reset"}
            </HapticButton>
          ) : (
            <HapticButton
              className="h-14 w-full text-base"
              haptic="success"
              onClick={() => mark("sent")}
              aria-label="Mark sent"
            >
              <Check className="h-6 w-6" />
              Mark Sent
            </HapticButton>
          )}
        </div>

        {/* Universal fallback when a native app scheme might not be registered. */}
        {showFallback && (
          <a
            href={waFallbackLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => haptic("light")}
            className="mt-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <Link2 className="h-3.5 w-3.5" />
            Open via wa.me link instead
          </a>
        )}
      </div>

      <Sheet
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="Campaign messages"
        description="Filter by outcome to see who's in each bucket. Tap one to jump to it."
      >
        {/* Segmented filter across All + every status. */}
        <div className="no-scrollbar -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1">
          {(
            [
              { key: "all", label: `All ${messages.length}` },
              { key: "needs_review", label: `Review ${progress.needsReview}` },
              { key: "skipped", label: `Skipped ${progress.skipped}` },
              { key: "failed", label: `Failed ${progress.failed}` },
              { key: "sent", label: `Sent ${progress.sent}` },
              { key: "pending", label: `Pending ${progress.pending}` },
            ] as { key: MessageStatus | "all"; label: string }[]
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setReviewFilter(f.key)}
              className={
                "shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors " +
                (reviewFilter === f.key
                  ? "bg-accent text-accent-foreground ring-1 ring-primary/30"
                  : "bg-secondary text-muted-foreground hover:text-foreground")
              }
            >
              {f.label}
            </button>
          ))}
        </div>

        {reviewList.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nothing here.
          </p>
        ) : (
          <ul className="space-y-2">
            {reviewList.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => jumpTo(m)}
                  className="flex flex-1 items-center gap-3 rounded-2xl border border-hairline bg-card p-3 text-left hover:bg-secondary"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground line-clamp-2 [overflow-wrap:anywhere]">
                      {m.contactName}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {m.phone}
                    </p>
                  </div>
                  <Badge variant={STATUS_META[m.status].variant}>
                    {STATUS_META[m.status].label}
                  </Badge>
                </button>
                {/* Quick remove from the queue — offered for every bucket except
                    Sent, where dropping a contact you've already messaged makes
                    no sense (Req 1). */}
                {m.status !== "sent" && (
                  <button
                    type="button"
                    onClick={() => setReviewRemoveTarget(m)}
                    aria-label={`Remove ${m.contactName}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <CircleMinus className="h-5 w-5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      <Sheet
        open={manageOpen}
        onClose={() => {
          setManageOpen(false);
          setRenaming(false);
        }}
        title="Manage campaign"
        description={campaign.name}
      >
        <div className="space-y-2">
          {/* Rename */}
          {renaming ? (
            <div className="flex items-center gap-2 rounded-2xl border border-hairline bg-card p-2">
              <Input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Campaign name"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveRename();
                }}
              />
              <Button size="sm" onClick={saveRename}>
                Save
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setNameDraft(campaign.name);
                setRenaming(true);
              }}
              className="flex w-full items-center gap-3 rounded-2xl border border-hairline bg-card p-3 text-left transition-colors hover:bg-secondary"
            >
              <Pencil className="h-5 w-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-foreground">Rename</span>
                <span className="block truncate text-sm text-muted-foreground">
                  {campaign.name}
                </span>
              </span>
            </button>
          )}

          {/* Regenerate message text */}
          <button
            type="button"
            onClick={() => {
              setManageOpen(false);
              void regenerate();
            }}
            className="flex w-full items-center gap-3 rounded-2xl border border-hairline bg-card p-3 text-left transition-colors hover:bg-secondary"
          >
            <RefreshCw className="h-5 w-5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-foreground">
                Regenerate messages
              </span>
              <span className="block text-sm text-muted-foreground">
                Re-render text from the current template, progress kept.
              </span>
            </span>
          </button>

          {/* Refresh contacts — reconcile the queue with the current source. */}
          <button
            type="button"
            onClick={refreshContacts}
            className="flex w-full items-center gap-3 rounded-2xl border border-hairline bg-card p-3 text-left transition-colors hover:bg-secondary"
          >
            <Users className="h-5 w-5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-foreground">
                Refresh contacts
              </span>
              <span className="block text-sm text-muted-foreground">
                {campaign.categoryIds.length
                  ? "Add people newly in the source group(s) and drop those removed."
                  : "Re-sync this campaign with its saved selection."}
              </span>
            </span>
          </button>

          {/* Add people — manually drop contacts into this campaign (Req #3). */}
          <button
            type="button"
            onClick={() => {
              setManageOpen(false);
              setAddPeopleOpen(true);
            }}
            className="flex w-full items-center gap-3 rounded-2xl border border-hairline bg-card p-3 text-left transition-colors hover:bg-secondary"
          >
            <UserPlus className="h-5 w-5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-foreground">
                Add people
              </span>
              <span className="block text-sm text-muted-foreground">
                Hand-pick contacts to add. They stay on a refresh.
              </span>
            </span>
          </button>

          {/* Reset progress */}
          <button
            type="button"
            onClick={resetProgress}
            className="flex w-full items-center gap-3 rounded-2xl border border-hairline bg-card p-3 text-left transition-colors hover:bg-secondary"
          >
            <RotateCcw className="h-5 w-5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-foreground">
                Reset progress
              </span>
              <span className="block text-sm text-muted-foreground">
                Send everyone back to Pending and rewind to the start.
              </span>
            </span>
          </button>

          {/* Delete */}
          <button
            type="button"
            onClick={remove}
            className="flex w-full items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-left transition-colors hover:bg-destructive/10"
          >
            <Trash2 className="h-5 w-5 shrink-0 text-destructive" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-destructive">
                Delete campaign
              </span>
              <span className="block text-sm text-muted-foreground">
                Remove the campaign and all its messages. Can&apos;t be undone.
              </span>
            </span>
          </button>
        </div>
      </Sheet>

      {/* Add a template to the campaign (from the per-person picker). */}
      <Sheet
        open={addTemplateOpen}
        onClose={() => setAddTemplateOpen(false)}
        title="Add a template"
        description="Attach another template so you can switch a person's message to it."
      >
        {attachableTemplates.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Every template is already attached. Create more from the Templates tab.
          </p>
        ) : (
          <ul className="space-y-2">
            {attachableTemplates.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => attachTemplate(t.id)}
                  className="flex min-h-touch w-full items-center justify-between gap-2 rounded-2xl border border-hairline bg-card p-3 text-left hover:bg-secondary"
                >
                  <span className="truncate font-semibold text-foreground">
                    {t.name}
                  </span>
                  <Plus className="h-4 w-4 shrink-0 text-primary" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      {/* Manually add contacts to this campaign (Req #3). */}
      <AddPeopleToCampaignSheet
        open={addPeopleOpen}
        campaignId={campaignId}
        onClose={() => setAddPeopleOpen(false)}
        onAdded={(count) => {
          if (typeof window !== "undefined") {
            window.alert(
              count === 0
                ? "Those contacts are already in this campaign."
                : `Added ${count} ${count === 1 ? "person" : "people"} to this campaign.`,
            );
          }
        }}
      />

      {/* Remove options for a person tapped in the review list (Req 1): from this
          campaign only, or as a contact everywhere. */}
      <Sheet
        open={reviewRemoveTarget !== null}
        onClose={() => setReviewRemoveTarget(null)}
        title={reviewRemoveTarget?.contactName ?? "Remove"}
        description="Remove this person from this campaign, or from your contacts entirely."
      >
        <div className="space-y-2">
          <button
            type="button"
            onClick={removeReviewFromCampaign}
            className="flex w-full items-center gap-3 rounded-2xl border border-hairline bg-card p-3 text-left transition-colors hover:bg-secondary"
          >
            <UserMinus className="h-5 w-5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-foreground">
                Remove from this campaign
              </span>
              <span className="block text-sm text-muted-foreground">
                Drops them from this queue only. Keeps their contact and group
                membership.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={removeReviewContactEntirely}
            className="flex w-full items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-left transition-colors hover:bg-destructive/10"
          >
            <UserX className="h-5 w-5 shrink-0 text-destructive" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-destructive">
                Remove contact entirely
              </span>
              <span className="block text-sm text-muted-foreground">
                Hides them everywhere and skips them on future imports. Restorable
                from Settings → Removed contacts.
              </span>
            </span>
          </button>
        </div>
      </Sheet>

      {/* Per-person options — remove from the queue, or from a source group. */}
      <Sheet
        open={personMenuOpen}
        onClose={() => setPersonMenuOpen(false)}
        title={current.contactName}
        description="Remove this person from the campaign, a source group, or your contacts entirely."
      >
        <div className="space-y-2">
          <button
            type="button"
            onClick={removeFromCampaign}
            className="flex w-full items-center gap-3 rounded-2xl border border-hairline bg-card p-3 text-left transition-colors hover:bg-secondary"
          >
            <UserMinus className="h-5 w-5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-foreground">
                Remove from this campaign
              </span>
              <span className="block text-sm text-muted-foreground">
                Drops them from this queue only. Keeps their group membership.
              </span>
            </span>
          </button>

          {/* Remove as a contact entirely — the "no WhatsApp / wrong number" case. */}
          <button
            type="button"
            onClick={removeContactEntirely}
            className="flex w-full items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-left transition-colors hover:bg-destructive/10"
          >
            <UserX className="h-5 w-5 shrink-0 text-destructive" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-destructive">
                Remove contact entirely
              </span>
              <span className="block text-sm text-muted-foreground">
                No WhatsApp / wrong number. Hides them everywhere and skips them on
                future imports. Restorable from Settings.
              </span>
            </span>
          </button>

          {(sourceCategories ?? []).map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => removeFromCategory(cat.id)}
              className="flex w-full items-center gap-3 rounded-2xl border border-hairline bg-card p-3 text-left transition-colors hover:bg-secondary"
            >
              <FolderMinus className="h-5 w-5 shrink-0 text-destructive" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-foreground">
                  Remove from “{cat.name}”
                </span>
                <span className="block text-sm text-muted-foreground">
                  Strips them from the group so future lists exclude them, and
                  drops them from this queue.
                </span>
              </span>
            </button>
          ))}

          {(sourceCategories ?? []).length === 0 && (
            <p className="px-1 text-sm text-muted-foreground">
              This campaign isn&apos;t tied to a group, so there&apos;s no category
              to remove them from.
            </p>
          )}
        </div>
      </Sheet>
    </div>
  );
}
