"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Check,
  SkipForward,
  RefreshCw,
  MoreVertical,
  Pencil,
  RotateCcw,
  Trash2,
  Star,
  Plus,
  Link2,
  Search,
  Settings2,
  CircleMinus,
  UserMinus,
  UserPlus,
  UserX,
  Users,
  FilePlus2,
  PhoneForwarded,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HapticButton } from "@/components/ui/haptic-button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/sheet";
import { ExpandableText } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { nextDeepLinkTarget } from "@/lib/deep-link";
import { haptic } from "@/lib/haptics";
import type { CampaignMessage, MessageStatus } from "@/lib/types";
import { templatesRepo } from "@/features/templates/lib/repository";
import { contactsRepo } from "@/features/contacts/lib/repository";
import { callsRepo } from "@/features/calls/lib/repository";
import { eventsRepo } from "@/features/analytics/lib/repository";
import { useSettings } from "@/features/settings/hooks/useSettings";
import { TemplateEditor } from "@/features/templates/components/TemplateEditor";
import { campaignsRepo } from "../lib/repository";
import { computeProgress, resumeIndex } from "../lib/progress";
import { buildWaLink, openWhatsApp } from "../lib/whatsapp";
import { AddPeopleToCampaignSheet } from "./AddPeopleToCampaignSheet";

// Display metadata kept for EVERY status so legacy messages (needs_review /
// failed from older app versions) still render correctly even though the app no
// longer creates those states. Active outreach now only produces sent/skipped.
const STATUS_META: Record<MessageStatus, { label: string; variant: "success" | "secondary" | "destructive" | "default" }> = {
  pending: { label: "Pending", variant: "secondary" },
  sent: { label: "Sent", variant: "success" },
  skipped: { label: "Skipped", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
  needs_review: { label: "Needs review", variant: "default" },
};

// How far (px) the card must travel before a swipe commits to its action.
const SWIPE_THRESHOLD = 96;

// The WhatsApp glyph (Simple Icons, CC0) so the button carries the real brand
// mark instead of a generic chat bubble (Req #7). `currentColor` by default; pass
// a className to tint it (the brand green is #25D366).
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

export function SendingQueue({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Deep-link target: jump the queue straight to this person on load (the
  // round-trip back from the Call section's "Open in campaign").
  const focusContactId = searchParams.get("contact");
  const settings = useSettings();

  const campaign = useLiveQuery(() => campaignsRepo.get(campaignId), [campaignId]);
  const messages = useLiveQuery(
    () => campaignsRepo.messagesFor(campaignId),
    [campaignId],
  );
  const templates = useLiveQuery(() => templatesRepo.all(), []) ?? [];

  const [index, setIndex] = React.useState(0);

  const [manageOpen, setManageOpen] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState("");
  // Gear sheet: choose which templates show in this campaign and their order.
  const [gearOpen, setGearOpen] = React.useState(false);
  // Create/edit a template in place (the Add chip + the gear's "Create" button).
  const [createTemplateOpen, setCreateTemplateOpen] = React.useState(false);
  const [addPeopleOpen, setAddPeopleOpen] = React.useState(false);
  // In-campaign search (Req #1): a lightweight sheet to find and jump to anyone,
  // with a status filter so e.g. skipped people are easy to revisit.
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchStatus, setSearchStatus] = React.useState<MessageStatus | "all">(
    "all",
  );
  // The anchored Delete menu on the action row (Req #6): one popup, the single
  // place to drop a person from the queue or from contacts entirely.
  const [deleteMenuOpen, setDeleteMenuOpen] = React.useState(false);

  // Transient action feedback (Req #9): a brief floating pill confirming what
  // just happened ("Sent to Alice", "Skipped Bob"), so an action never feels
  // silent. Auto-clears.
  const [feedback, setFeedback] = React.useState<{
    text: string;
    tone: "sent" | "skip" | "remove";
  } | null>(null);
  const feedbackTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Which slice of the progress bar the user tapped to read out: the headline %
  // shows sent% by default (green) and temporarily flips to skipped% (grey) when
  // the grey slice is tapped, auto-reverting after a moment (Req #5).
  const [barSel, setBarSel] = React.useState<"sent" | "skipped" | null>(null);
  const barSelTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectBar = (which: "sent" | "skipped") => {
    if (barSelTimer.current) clearTimeout(barSelTimer.current);
    haptic("light");
    setBarSel(which);
    barSelTimer.current = setTimeout(() => setBarSel(null), 1800);
  };
  React.useEffect(
    () => () => {
      if (barSelTimer.current) clearTimeout(barSelTimer.current);
    },
    [],
  );
  const flash = React.useCallback(
    (text: string, tone: "sent" | "skip" | "remove") => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
      setFeedback({ text, tone });
      feedbackTimer.current = setTimeout(() => setFeedback(null), 1700);
    },
    [],
  );
  React.useEffect(
    () => () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    },
    [],
  );

  // --- Swipe state (Tinder-style, full content area) -----------------------
  const [dragX, setDragX] = React.useState(0);
  // A committed fling animation playing the card off-screen (to the left, the
  // skip direction) before we advance.
  const [exit, setExit] = React.useState<"left" | null>(null);
  const drag = React.useRef<{
    startX: number;
    startY: number;
    active: boolean;
    axis: "h" | "v" | null;
    crossed: boolean;
  } | null>(null);

  const initialized = React.useRef(false);
  // The `?contact=` deep-link target we last jumped to (keyed on value, not
  // mount), so a changed target on a reused screen still re-focuses the queue.
  const handledContact = React.useRef<string | null>(null);

  const templateName = React.useCallback(
    (id: string) => templates.find((t) => t.id === id)?.name ?? "Template",
    [templates],
  );

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
    // Record the outcome for cross-day analytics (only the meaningful, terminal
    // states the app still produces).
    if (status === "sent" || status === "skipped") {
      eventsRepo.log(`message_${status}`, {
        ref: current.contactId,
        campaignId,
        templateId: current.templateId,
      });
    }
    await campaignsRepo.setMessageStatus(current.id, status);
    if (status === "sent") flash(`Sent to ${current.contactName}`, "sent");
    else if (status === "skipped") flash(`Skipped ${current.contactName}`, "skip");

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
  // keeping progress. Confirmed because it rewrites stored message text and can
  // add/remove people.
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

  // --- Gear: manage which templates show in this campaign and their order. ---
  const attachTemplate = (templateId: string) => {
    haptic("light");
    void campaignsRepo.addTemplate(campaignId, templateId);
  };
  const detachTemplate = (templateId: string) => {
    haptic("light");
    void campaignsRepo.removeTemplate(campaignId, templateId);
  };
  const makePrimary = (templateId: string) => {
    haptic("light");
    void campaignsRepo.setPrimaryTemplate(campaignId, templateId);
  };
  const moveTemplate = (templateId: string, dir: -1 | 1) => {
    if (!campaign) return;
    const order = [...campaign.templateIds];
    const i = order.indexOf(templateId);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j]!, order[i]!];
    haptic("light");
    void campaignsRepo.setTemplateOrder(campaignId, order);
  };

  // Open the create/edit-template sheet; remember the current template ids so a
  // brand-new one can be auto-attached to this campaign when the live query
  // brings it in.
  const idsBeforeCreate = React.useRef<Set<string> | null>(null);
  React.useEffect(() => {
    if (idsBeforeCreate.current === null) return;
    const fresh = templates.filter((t) => !idsBeforeCreate.current!.has(t.id));
    if (fresh.length === 0) return;
    idsBeforeCreate.current = null;
    for (const t of fresh) void campaignsRepo.addTemplate(campaignId, t.id);
  }, [templates, campaignId]);
  const openCreateTemplate = () => {
    idsBeforeCreate.current = new Set(templates.map((t) => t.id));
    setGearOpen(false);
    setCreateTemplateOpen(true);
  };

  // Reset just the current person back to Pending.
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
    setDeleteMenuOpen(false);
    haptic("warning");
    flash(`Removed ${current.contactName} from campaign`, "remove");
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
    setDeleteMenuOpen(false);
    haptic("warning");
    flash(`Removed ${current.contactName}`, "remove");
    await contactsRepo.remove([current.contactId]);
    await campaignsRepo.removeMessage(campaignId, current.contactId);
    setIndex((i) => Math.max(0, Math.min(i, messages.length - 2)));
  };

  // Open this person's Call view screen (Req #1/#2). Ensures they're on
  // the call list (linking this campaign as talking-point context), pins the
  // queue to them, and deep-links the call screen with a return origin + nonce so
  // the round-trip re-focuses this exact person. See [[campaign-call-deeplink]].
  const openCallView = async () => {
    if (!messages) return;
    const cur = messages[Math.min(index, messages.length - 1)];
    if (!cur) return;
    haptic("light");
    if (!(await callsRepo.get(cur.contactId))) {
      await callsRepo.addContacts([cur.contactId], [campaignId]);
    }
    persistIndex(Math.min(index, messages.length - 1));
    const back = `/campaigns/${campaignId}?contact=${encodeURIComponent(cur.contactId)}`;
    const nonce = Date.now().toString(36);
    router.push(
      `/call?contact=${encodeURIComponent(cur.contactId)}&from=${encodeURIComponent(back)}&t=${nonce}`,
    );
  };

  const openCurrentWhatsApp = () => {
    if (!messages) return;
    const cur = messages[Math.min(index, messages.length - 1)];
    if (!cur) return;
    openWhatsApp(cur.phone, cur.message, settings.whatsappApp);
  };

  // --- Swipe gestures (Req #9): left → Skip (fling-off), right → WhatsApp. ---
  const onSwipePointerDown = (e: React.PointerEvent) => {
    if (exit) return;
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      active: true,
      axis: null,
      crossed: false,
    };
  };
  const onSwipePointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d?.active) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (d.axis === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      // Lock to the dominant axis on first real movement so a vertical scroll is
      // never hijacked into a swipe.
      d.axis = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    }
    if (d.axis !== "h") return;
    setDragX(dx);
    // A single tactile + once-only nudge the moment a direction "arms", so the
    // user feels the commit point before lifting (works in an iOS PWA too).
    const past = Math.abs(dx) > SWIPE_THRESHOLD;
    if (past && !d.crossed) {
      d.crossed = true;
      haptic("light");
    } else if (!past && d.crossed) {
      d.crossed = false;
    }
  };
  const endSwipe = () => {
    const d = drag.current;
    if (!d) return;
    d.active = false;
    if (d.axis === "h") {
      if (dragX > SWIPE_THRESHOLD) {
        // Right → Send message (WhatsApp). The card snaps back (the action opens
        // WhatsApp over the app rather than dismissing the person).
        haptic("success");
        setDragX(0);
        openCurrentWhatsApp();
        return;
      }
      if (dragX < -SWIPE_THRESHOLD) {
        // Left → Skip. Fling the card off, then advance to the next person.
        haptic("warning");
        setExit("left");
        window.setTimeout(() => {
          void mark("skipped");
          setExit(null);
          setDragX(0);
        }, 200);
        return;
      }
    }
    setDragX(0);
  };

  const openManage = () => {
    setNameDraft(campaign?.name ?? "");
    setRenaming(false);
    setManageOpen(true);
  };

  // Inline rename straight from the header title (Req #4).
  const startRename = () => {
    setNameDraft(campaign?.name ?? "");
    setRenaming(true);
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
  const isFinal =
    current.status === "sent" ||
    current.status === "skipped" ||
    current.status === "failed";
  // Templates not yet attached to this campaign (for the "Add template" picker).
  const attachableTemplates = templates.filter(
    (t) => !campaign.templateIds.includes(t.id),
  );

  // Keep the campaign name on the controls row (Req #4) but shrink the type for
  // longer names so it stays on one line and only ellipsises in the extreme.
  const nameLen = campaign.name.length;
  const nameSizeClass =
    nameLen <= 16
      ? "text-lg"
      : nameLen <= 24
        ? "text-base"
        : nameLen <= 34
          ? "text-sm"
          : "text-xs";

  // The current person's status tints the preview card with a subtle background
  // fill (no harsh accent line) plus a solid badge, so the sent/skipped/pending
  // state reads without overwhelming the card (Req #2 / status visibility).
  const statusAccent =
    current.status === "sent"
      ? { fill: "bg-primary/[0.06]", badge: "bg-primary text-primary-foreground", label: "Sent" }
      : current.status === "skipped"
        ? {
            fill: "bg-muted-foreground/[0.07]",
            badge: "bg-muted-foreground text-white",
            label: "Skipped",
          }
        : current.status === "failed"
          ? {
              fill: "bg-destructive/[0.06]",
              badge: "bg-destructive text-white",
              label: "Failed",
            }
          : current.status === "needs_review"
            ? {
                fill: "bg-amber-400/[0.10]",
                badge: "bg-amber-500 text-white",
                label: "Needs review",
              }
            : {
                fill: "bg-card",
                badge: "bg-secondary text-foreground",
                label: "Not sent yet",
              };

  // Search: filter by name/number AND by the chosen status. The status chips
  // only surface buckets that actually have someone in them (so "Skipped" shows
  // up exactly when there are skipped people to revisit — Req #3).
  const q = searchQuery.trim().toLowerCase();
  const statusChips = (
    [
      { key: "all", label: "All", count: messages.length },
      { key: "pending", label: "Pending", count: progress.pending },
      { key: "sent", label: "Sent", count: progress.sent },
      { key: "skipped", label: "Skipped", count: progress.skipped },
      { key: "needs_review", label: "Review", count: progress.needsReview },
      { key: "failed", label: "Failed", count: progress.failed },
    ] as { key: MessageStatus | "all"; label: string; count: number }[]
  ).filter((c) => c.key === "all" || c.count > 0);
  const searchResults = messages.filter((m) => {
    if (searchStatus !== "all" && m.status !== searchStatus) return false;
    if (!q) return true;
    return (
      m.contactName.toLowerCase().includes(q) ||
      m.phone.toLowerCase().includes(q)
    );
  });

  const jumpTo = (message: CampaignMessage) => {
    const target = messages.findIndex((m) => m.id === message.id);
    if (target !== -1) goTo(target);
    setSearchOpen(false);
    setSearchQuery("");
    setSearchStatus("all");
  };

  // Swipe hint intensities + card transform. Drag RIGHT (positive) = send
  // message (WhatsApp); drag LEFT (negative) = skip. These must match the
  // commit directions in `endSwipe` so the flood overlay shows the action the
  // release will actually perform.
  const sendHint = Math.min(Math.max(dragX, 0) / SWIPE_THRESHOLD, 1);
  const skipHint = Math.min(Math.max(-dragX, 0) / SWIPE_THRESHOLD, 1);
  const cardStyle: React.CSSProperties = exit
    ? {
        transform: "translateX(-130%) rotate(-14deg)",
        opacity: 0,
        transition: "transform 0.22s ease-in, opacity 0.22s ease-in",
      }
    : {
        transform: `translateX(${dragX}px) rotate(${dragX * 0.035}deg)`,
        transition: dragX === 0 ? "transform 0.28s cubic-bezier(0.22,1,0.36,1)" : "none",
      };

  return (
    <div className="flex h-dvh flex-col">
      {/* Header — back, the campaign name (tap to rename), and the action icons
          all share one row; the name auto-shrinks so it stays put (Req #4/#6). */}
      <header className="glass sticky top-0 z-30 border-b border-border/60 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {renaming ? (
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
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="Campaign name"
              autoFocus
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveRename();
                if (e.key === "Escape") setRenaming(false);
              }}
              onBlur={() => void saveRename()}
            />
            <Button size="sm" onClick={saveRename}>
              Save
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/campaigns")}
              aria-label="Back to campaigns"
              className="-ml-2"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <button
              type="button"
              onClick={startRename}
              aria-label="Rename campaign"
              className="flex min-w-0 flex-1 items-center gap-1 text-left"
            >
              <h1
                className={cn(
                  "truncate font-bold tracking-tight text-foreground",
                  nameSizeClass,
                )}
              >
                {campaign.name}
              </h1>
              <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setSearchQuery("");
                setSearchStatus("all");
                setSearchOpen(true);
              }}
              aria-label="Search this campaign"
            >
              <Search className="h-5 w-5" />
            </Button>
            {/* Refresh — icon only, no label or button chrome (Req #5). */}
            <Button
              variant="ghost"
              size="icon"
              onClick={refreshAll}
              disabled={refreshing}
              aria-label="Refresh contacts and messages"
            >
              <RefreshCw className={cn("h-5 w-5", refreshing && "animate-spin")} />
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
        )}

        {/* Stats line: queue position, then the counts, with the headline % bold
            on the right (Req #5/#7). The % reflects the bar selection: sent% in
            green by default, skipped% in grey while the grey slice is tapped. */}
        {(() => {
          const skippedPct = Math.round(progress.skippedFraction * 100);
          const showSkipped = barSel === "skipped";
          return (
            <>
              <div className="mt-1.5 flex items-center gap-2.5 text-xs text-muted-foreground">
                <span className="shrink-0 font-semibold tabular-nums text-foreground">
                  {index + 1}/{messages.length}
                </span>
                <span className="min-w-0 flex-1 truncate text-center">
                  <span className="font-semibold text-primary">
                    {progress.sent}
                  </span>{" "}
                  sent
                  <span className="px-1.5 text-muted-foreground/40">·</span>
                  {progress.skipped} skipped
                  <span className="px-1.5 text-muted-foreground/40">·</span>
                  {progress.pending} left
                </span>
                <span
                  className={cn(
                    "shrink-0 text-sm font-bold tabular-nums transition-colors",
                    showSkipped ? "text-muted-foreground" : "text-primary",
                  )}
                >
                  {showSkipped ? skippedPct : progress.percent}%
                </span>
              </div>

              {/* Segmented bar — green = sent, grey = skipped, rest = pending.
                  Each coloured slice has a taller invisible hit-zone so it's
                  tappable without changing the slim bar's look (Req #5). */}
              <div className="relative mt-2">
                <div
                  className="flex h-2 w-full overflow-hidden rounded-full bg-secondary shadow-[inset_0_1px_2px_rgba(16,24,40,0.06)]"
                  role="progressbar"
                  aria-valuenow={progress.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Sent progress"
                >
                  {/* NOTE: plain class strings (no cn/twMerge) — merging
                      `bg-primary` with `bg-gradient-to-b` makes twMerge drop the
                      colour. Dimming is applied via inline opacity instead. */}
                  <div
                    className="h-full bg-primary bg-gradient-to-b from-white/25 to-transparent transition-all duration-500 ease-out"
                    style={{
                      width: `${progress.percent}%`,
                      opacity: showSkipped ? 0.6 : 1,
                    }}
                  />
                  <div
                    className="h-full bg-muted-foreground/35 transition-all duration-500 ease-out"
                    style={{
                      width: `${skippedPct}%`,
                      opacity: barSel === "sent" ? 0.5 : 1,
                    }}
                  />
                </div>
                {progress.percent > 0 && (
                  <button
                    type="button"
                    onClick={() => selectBar("sent")}
                    aria-label="Show sent percentage"
                    className="absolute -top-2.5 bottom-[-0.625rem] left-0"
                    style={{ width: `${progress.percent}%` }}
                  />
                )}
                {skippedPct > 0 && (
                  <button
                    type="button"
                    onClick={() => selectBar("skipped")}
                    aria-label="Show skipped percentage"
                    className="absolute -top-2.5 bottom-[-0.625rem]"
                    style={{
                      left: `${progress.percent}%`,
                      width: `${skippedPct}%`,
                    }}
                  />
                )}
              </div>
            </>
          );
        })()}
      </header>

      {/* Scrollable body */}
      <div className="flex flex-1 flex-col overflow-y-auto px-4 py-4">
        {/* Template row: a sticky gear (manage which templates show + order)
            pinned left while the chips scroll horizontally, then a chip per
            attached template (tap to re-render THIS person from it), then Add.
            Kept OUT of the swipe area so its own scroll isn't hijacked. */}
        <div className="no-scrollbar -my-1 mb-1 flex items-center gap-1.5 overflow-x-auto py-1 pl-0.5 pr-0.5">
          <button
            type="button"
            onClick={() => setGearOpen(true)}
            aria-label="Manage campaign templates"
            className="sticky left-0 z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-foreground shadow-soft ring-1 ring-hairline transition-colors hover:bg-secondary active:scale-95"
          >
            <Settings2 className="h-4 w-4" />
          </button>
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
        </div>

        {/* Swipe arena (Req #9): the whole region below the chips is draggable —
            drag right for WhatsApp, left to Skip — with live directional hints,
            so it feels like a card deck rather than a tiny target. */}
        <div
          className="relative mt-3 flex flex-1 select-none flex-col"
          onPointerDown={onSwipePointerDown}
          onPointerMove={onSwipePointerMove}
          onPointerUp={endSwipe}
          onPointerCancel={endSwipe}
          onPointerLeave={() => {
            if (drag.current?.active) endSwipe();
          }}
          style={{ touchAction: "pan-y" }}
        >
          <div
            style={cardStyle}
            className={cn(
              "relative overflow-hidden rounded-3xl p-4 shadow-card ring-1 ring-hairline",
              statusAccent.fill,
            )}
          >
            {/* Name + number on the left, status badge on the right of the same
                row. */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-lg font-bold tracking-tight text-foreground">
                  {current.contactName}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {current.phone}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold",
                  statusAccent.badge,
                )}
              >
                {statusAccent.label}
              </span>
            </div>
            <div className="mt-3 rounded-2xl border border-border/60 bg-[#e6ddd3] p-3">
              <div className="ml-auto max-w-[92%] rounded-2xl rounded-tr-md bg-[#dcf8c6] px-3.5 py-2.5 shadow-sm">
                {/* Expanded text scrolls within itself so a long message never
                    shoves the templates/actions around (Req #7). */}
                <ExpandableText
                  text={current.message}
                  lines={6}
                  className="text-[13px] leading-relaxed text-[#111b21]"
                  expandedClassName="max-h-[34vh] overflow-y-auto"
                  toggleClassName="text-[#075e54]"
                />
              </div>
            </div>

            {/* Bold swipe-action flood: as you drag, the whole card fills with the
                action colour + a big label, so it's unmistakable which way does
                what (drag right = Send, left = Skip). */}
            {(sendHint > 0 || skipHint > 0) && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-white"
                style={{
                  opacity: Math.min(Math.max(sendHint, skipHint), 1),
                  backgroundColor:
                    sendHint >= skipHint
                      ? "rgba(37,211,102,0.94)"
                      : "rgba(100,116,139,0.94)",
                }}
              >
                {sendHint >= skipHint ? (
                  <WhatsAppIcon className="h-12 w-12" />
                ) : (
                  <SkipForward className="h-12 w-12" />
                )}
                <span className="text-xl font-extrabold uppercase tracking-wide">
                  {sendHint >= skipHint ? "Send message" : "Skip"}
                </span>
              </div>
            )}
          </div>

          {/* A subtle hint so swiping is discoverable on first use. */}
          <p className="mt-3 text-center text-[11px] font-medium text-muted-foreground/70">
            Swipe right to send message · left to skip
          </p>
        </div>
      </div>

      {/* Sticky action stack, lifted for easy thumb reach. */}
      <div className="glass sticky bottom-0 border-t border-border/60 px-4 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        {/* Transient action feedback (Req #9), floating just above the controls. */}
        {feedback && (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute -top-12 left-1/2 z-20 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 duration-200"
          >
            <span
              className={cn(
                "flex max-w-[88vw] items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold text-white shadow-float",
                feedback.tone === "sent" && "bg-primary",
                feedback.tone === "skip" && "bg-foreground/80",
                feedback.tone === "remove" && "bg-destructive",
              )}
            >
              {feedback.tone === "sent" && <Check className="h-4 w-4 shrink-0" />}
              {feedback.tone === "skip" && (
                <SkipForward className="h-4 w-4 shrink-0" />
              )}
              {feedback.tone === "remove" && (
                <Trash2 className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate">{feedback.text}</span>
            </span>
          </div>
        )}

        {/* One compact row of icon-only controls: Prev · Delete · Call view ·
            Skip · Next (the position now lives in the header progress line). */}
        <div className="mb-2.5 grid grid-cols-5 gap-2">
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            aria-label="Previous person"
            className="flex h-14 items-center justify-center rounded-2xl bg-secondary text-foreground transition-colors hover:bg-secondary/70 active:scale-95 disabled:opacity-40"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="relative">
            <HapticButton
              variant="outline"
              haptic="light"
              className="h-14 w-full"
              onClick={() => setDeleteMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={deleteMenuOpen}
              aria-label="Delete options"
            >
              <Trash2 className="h-5 w-5 text-destructive" />
            </HapticButton>
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
                  className="absolute bottom-full left-0 z-50 mb-2 w-60 overflow-hidden rounded-2xl border border-hairline bg-card p-1.5 shadow-float animate-in fade-in zoom-in-95 duration-150"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={removeFromCampaign}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-secondary"
                  >
                    <UserMinus className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground">
                      Remove from campaign
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={removeContactEntirely}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-destructive/10"
                  >
                    <UserX className="h-4 w-4 shrink-0 text-destructive" />
                    <span className="text-sm font-semibold text-destructive">
                      Remove contact entirely
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Call icon — opens this person's Call view (Req #2), in caller green. */}
          <HapticButton
            variant="outline"
            haptic="light"
            className="h-14 w-full border-[#34C759]/45 hover:bg-[#34C759]/10"
            onClick={openCallView}
            aria-label={`Open call view for ${current.contactName}`}
          >
            <PhoneForwarded className="h-5 w-5 text-[#34C759]" />
          </HapticButton>

          <HapticButton
            variant="outline"
            className="h-14 w-full"
            onClick={() => mark("skipped")}
            aria-label="Skip"
          >
            <SkipForward className="h-5 w-5" />
          </HapticButton>

          <button
            type="button"
            onClick={() => goTo(index + 1)}
            disabled={index >= messages.length - 1}
            aria-label="Next person"
            className="flex h-14 items-center justify-center rounded-2xl bg-secondary text-foreground transition-colors hover:bg-secondary/70 active:scale-95 disabled:opacity-40"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Two large primary actions — the core send loop. */}
        <div className="grid grid-cols-2 gap-3">
          <HapticButton
            className="h-14 w-full text-base"
            variant="outline"
            onClick={openCurrentWhatsApp}
          >
            <WhatsAppIcon className="h-5 w-5 text-[#25D366]" />
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
              Reset
            </HapticButton>
          ) : (
            <HapticButton
              className="h-14 w-full text-base"
              haptic="success"
              onClick={() => mark("sent")}
              aria-label="Send"
            >
              Send
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

      {/* In-campaign search (Req #1 + #3): find anyone, filter by status (e.g.
          revisit Skipped), tap to jump to them. */}
      <Sheet
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        title="Find someone"
        description="Search or filter this campaign, then tap a result to jump to them."
      >
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search name or number"
          autoFocus
          className="mb-3"
        />
        <div className="no-scrollbar -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1">
          {statusChips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setSearchStatus(c.key)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors",
                searchStatus === c.key
                  ? "bg-accent text-accent-foreground ring-1 ring-primary/30"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {c.label} {c.count}
            </button>
          ))}
        </div>
        {searchResults.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No one matches.
          </p>
        ) : (
          <ul className="space-y-2">
            {searchResults.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => jumpTo(m)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-hairline bg-card p-3 text-left hover:bg-secondary"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground line-clamp-1 [overflow-wrap:anywhere]">
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

          {/* Add people — manually drop contacts into this campaign. */}
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

      {/* Gear: pick which templates show in THIS campaign, set their order and
          the default (primary), or create a new one. */}
      <Sheet
        open={gearOpen}
        onClose={() => setGearOpen(false)}
        title="Campaign templates"
      >
        <div className="space-y-2">
          {/* Attached, in campaign order — reorder, star the default, detach. */}
          {campaign.templateIds.map((tid, i) => {
            const isPrimary = campaign.primaryTemplateId === tid;
            const last = campaign.templateIds.length - 1;
            return (
              <div
                key={tid}
                className="flex items-center gap-1.5 rounded-2xl border border-hairline bg-card p-2 pl-3"
              >
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => moveTemplate(tid, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                    className="flex h-5 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary disabled:opacity-30"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveTemplate(tid, 1)}
                    disabled={i === last}
                    aria-label="Move down"
                    className="flex h-5 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary disabled:opacity-30"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
                <span className="min-w-0 flex-1 truncate font-semibold text-foreground">
                  {templateName(tid)}
                </span>
                <button
                  type="button"
                  onClick={() => makePrimary(tid)}
                  aria-label={isPrimary ? "Default template" : "Set as default"}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl hover:bg-secondary"
                >
                  <Star
                    className={cn(
                      "h-4 w-4",
                      isPrimary
                        ? "fill-amber-400 text-amber-500"
                        : "text-muted-foreground",
                    )}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => detachTemplate(tid)}
                  disabled={campaign.templateIds.length <= 1}
                  aria-label={`Remove ${templateName(tid)} from this campaign`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                >
                  <CircleMinus className="h-4 w-4" />
                </button>
              </div>
            );
          })}

          {/* Other templates you can add to this campaign. */}
          {attachableTemplates.length > 0 && (
            <>
              <p className="px-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Add to this campaign
              </p>
              {attachableTemplates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => attachTemplate(t.id)}
                  className="flex min-h-touch w-full items-center justify-between gap-2 rounded-2xl border border-hairline bg-card p-3 text-left hover:bg-secondary"
                >
                  <span className="truncate font-semibold text-foreground">
                    {t.name}
                  </span>
                  <Plus className="h-4 w-4 shrink-0 text-primary" />
                </button>
              ))}
            </>
          )}

          {/* Create a new template (the gear's Add — second entry point). */}
          <button
            type="button"
            onClick={openCreateTemplate}
            className="mt-1 flex min-h-touch w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/40 bg-accent/40 p-3 text-sm font-semibold text-primary transition-colors hover:bg-accent"
          >
            <FilePlus2 className="h-4 w-4" />
            Create a new template
          </button>
        </div>
      </Sheet>

      {/* Create/edit a template in place — selectable so you can start fresh or
          load an existing one and modify it. A brand-new one auto-attaches to
          this campaign. */}
      <TemplateEditor
        open={createTemplateOpen}
        template={null}
        selectable
        onClose={() => setCreateTemplateOpen(false)}
      />

      {/* Manually add contacts to this campaign. */}
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
    </div>
  );
}
