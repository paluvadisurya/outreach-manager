import type { CampaignMessage, MessageStatus } from "@/lib/types";

export interface CampaignProgress {
  total: number;
  pending: number;
  sent: number;
  skipped: number;
  failed: number;
  needsReview: number;
  /** sent + skipped + failed — messages the user has acted on and finished. */
  processed: number;
  /** Fraction in [0, 1] of messages processed. */
  fraction: number;
  /** Whole-number percentage of messages processed. */
  percent: number;
  /** True once no message remains pending or needs review. */
  complete: boolean;
}

export function computeProgress(messages: CampaignMessage[]): CampaignProgress {
  const counts: Record<MessageStatus, number> = {
    pending: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    needs_review: 0,
  };

  for (const m of messages) counts[m.status]++;

  const total = messages.length;
  const processed = counts.sent + counts.skipped + counts.failed;
  const fraction = total === 0 ? 0 : processed / total;

  return {
    total,
    pending: counts.pending,
    sent: counts.sent,
    skipped: counts.skipped,
    failed: counts.failed,
    needsReview: counts.needs_review,
    processed,
    fraction,
    percent: Math.round(fraction * 100),
    complete: total > 0 && counts.pending === 0 && counts.needs_review === 0,
  };
}

/**
 * Find the next index that still needs attention (pending or needs_review),
 * starting at `from`. Returns -1 when nothing remains. Used to advance the queue
 * and to recover the correct position when resuming a campaign.
 */
export function nextActionableIndex(
  messages: CampaignMessage[],
  from: number,
): number {
  for (let i = Math.max(0, from); i < messages.length; i++) {
    const status = messages[i]?.status;
    if (status === "pending" || status === "needs_review") return i;
  }
  return -1;
}

/**
 * Resolve the position a campaign should resume at: the stored index if it is
 * still actionable, otherwise the next actionable message, otherwise the last
 * message so the user lands on a sensible spot.
 */
export function resumeIndex(
  messages: CampaignMessage[],
  storedIndex: number,
): number {
  if (messages.length === 0) return 0;
  const clamped = Math.min(Math.max(0, storedIndex), messages.length - 1);
  const current = messages[clamped]?.status;
  if (current === "pending" || current === "needs_review") return clamped;

  const next = nextActionableIndex(messages, clamped);
  if (next !== -1) return next;

  const prev = firstActionableBefore(messages, clamped);
  if (prev !== -1) return prev;

  return clamped;
}

function firstActionableBefore(
  messages: CampaignMessage[],
  before: number,
): number {
  for (let i = Math.min(before, messages.length - 1); i >= 0; i--) {
    const status = messages[i]?.status;
    if (status === "pending" || status === "needs_review") return i;
  }
  return -1;
}
