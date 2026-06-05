"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Check,
  SkipForward,
  AlertTriangle,
  Eye,
  Pause,
  Play,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Sheet } from "@/components/ui/sheet";
import type { CampaignMessage, MessageStatus } from "@/lib/types";
import { campaignsRepo } from "../lib/repository";
import { computeProgress, resumeIndex } from "../lib/progress";
import { buildWaLink } from "../lib/whatsapp";

const STATUS_META: Record<MessageStatus, { label: string; variant: "success" | "secondary" | "destructive" | "default" }> = {
  pending: { label: "Pending", variant: "secondary" },
  sent: { label: "Sent", variant: "success" },
  skipped: { label: "Skipped", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
  needs_review: { label: "Needs review", variant: "default" },
};

export function SendingQueue({ campaignId }: { campaignId: string }) {
  const router = useRouter();

  const campaign = useLiveQuery(() => campaignsRepo.get(campaignId), [campaignId]);
  const messages = useLiveQuery(
    () => campaignsRepo.messagesFor(campaignId),
    [campaignId],
  );

  const [index, setIndex] = React.useState(0);
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const initialized = React.useRef(false);

  // On first load, resume exactly where the user left off.
  React.useEffect(() => {
    if (!initialized.current && campaign && messages) {
      initialized.current = true;
      setIndex(resumeIndex(messages, campaign.currentIndex));
    }
  }, [campaign, messages]);

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

  const togglePause = async () => {
    if (!campaign) return;
    await campaignsRepo.setStatus(
      campaignId,
      campaign.status === "paused" ? "active" : "paused",
    );
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
  const waLink = buildWaLink(current.phone, current.message);
  const statusMeta = STATUS_META[current.status];
  const paused = campaign.status === "paused";

  // Messages the user may want to revisit: skipped, failed, or flagged.
  const flagged = messages.filter(
    (m) =>
      m.status === "needs_review" ||
      m.status === "skipped" ||
      m.status === "failed",
  );

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
            variant="ghost"
            size="icon"
            onClick={regenerate}
            aria-label="Regenerate messages"
          >
            <RefreshCw className="h-5 w-5" />
          </Button>
          <Button variant="outline" size="sm" onClick={togglePause}>
            {paused ? (
              <>
                <Play className="h-4 w-4" />
                Resume
              </>
            ) : (
              <>
                <Pause className="h-4 w-4" />
                Pause
              </>
            )}
          </Button>
        </div>
        <div className="mt-2">
          <ProgressBar value={progress.fraction} />
        </div>

        {flagged.length > 0 && (
          <button
            type="button"
            onClick={() => setReviewOpen(true)}
            className="mt-2 flex w-full items-center justify-between rounded-xl bg-secondary px-3 py-2 text-sm font-medium text-foreground"
          >
            <span className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              Review flagged
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {progress.needsReview > 0 && <span>{progress.needsReview} review</span>}
              {progress.skipped > 0 && <span>· {progress.skipped} skipped</span>}
              {progress.failed > 0 && <span>· {progress.failed} failed</span>}
            </span>
          </button>
        )}
      </header>

      {/* Current message card */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">
            {index + 1} of {messages.length}
          </span>
          <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
        </div>

        <div className="mt-3 rounded-2xl border border-border/70 bg-card/80 p-4 shadow-soft">
          <p className="text-lg font-bold text-foreground">
            {current.contactName}
          </p>
          <p className="text-sm text-muted-foreground">{current.phone}</p>
          <div className="mt-3 rounded-2xl border border-border/60 bg-[#e6ddd3] p-3">
            <div className="ml-auto max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-[#dcf8c6] px-3.5 py-2.5 text-[15px] leading-relaxed text-[#111b21] shadow-sm">
              {current.message}
            </div>
          </div>
        </div>

        {/* Secondary marks — compact, one row, out of the primary thumb path */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            className="h-14 flex-col gap-1 text-xs"
            onClick={() => mark("skipped")}
          >
            <SkipForward className="h-5 w-5" />
            Skip
          </Button>
          <Button
            variant="outline"
            className="h-14 flex-col gap-1 text-xs"
            onClick={() => mark("needs_review")}
          >
            <Eye className="h-5 w-5" />
            Review
          </Button>
          <Button
            variant="outline"
            className="h-14 flex-col gap-1 text-xs"
            onClick={() => mark("failed")}
          >
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Failed
          </Button>
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
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <Button className="h-14 w-full text-base" variant="outline">
              <MessageCircle className="h-5 w-5 text-primary" />
              WhatsApp
            </Button>
          </a>
          <Button
            className="h-14 w-full text-base"
            onClick={() => mark("sent")}
            aria-label="Mark sent"
          >
            <Check className="h-6 w-6" />
            Mark Sent
          </Button>
        </div>
      </div>

      <Sheet
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="Review flagged"
        description="Skipped, failed and to-review messages. Tap one to jump to it."
      >
        {flagged.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nothing flagged.
          </p>
        ) : (
          <ul className="space-y-2">
            {flagged.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => jumpTo(m)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-card p-3 text-left hover:bg-secondary"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">
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
    </div>
  );
}
