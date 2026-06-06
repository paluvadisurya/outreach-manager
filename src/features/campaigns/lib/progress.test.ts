import { describe, it, expect } from "vitest";
import type { CampaignMessage, MessageStatus } from "@/lib/types";
import {
  computeProgress,
  nextActionableIndex,
  resumeIndex,
} from "./progress";

function msg(order: number, status: MessageStatus): CampaignMessage {
  return {
    id: `c:${order}`,
    campaignId: "c",
    contactId: `${order}`,
    contactName: `Contact ${order}`,
    phone: `+91${order}`,
    message: "Hi",
    templateId: "t",
    status,
    order,
    updatedAt: 0,
  };
}

describe("computeProgress", () => {
  it("counts statuses and computes percentage processed", () => {
    const messages = [
      msg(0, "sent"),
      msg(1, "sent"),
      msg(2, "skipped"),
      msg(3, "pending"),
    ];
    const p = computeProgress(messages);
    expect(p.total).toBe(4);
    expect(p.sent).toBe(2);
    expect(p.skipped).toBe(1);
    expect(p.processed).toBe(3);
    expect(p.percent).toBe(75);
    expect(p.complete).toBe(false);
  });

  it("is complete when nothing remains pending or needs review", () => {
    const p = computeProgress([msg(0, "sent"), msg(1, "skipped")]);
    expect(p.complete).toBe(true);
  });

  it("is not complete while a message needs review", () => {
    const p = computeProgress([msg(0, "sent"), msg(1, "needs_review")]);
    expect(p.complete).toBe(false);
  });

  it("handles an empty campaign", () => {
    const p = computeProgress([]);
    expect(p.percent).toBe(0);
    expect(p.complete).toBe(false);
  });
});

describe("nextActionableIndex", () => {
  it("finds the next pending or needs_review message", () => {
    const messages = [msg(0, "sent"), msg(1, "pending"), msg(2, "needs_review")];
    expect(nextActionableIndex(messages, 0)).toBe(1);
    expect(nextActionableIndex(messages, 2)).toBe(2);
  });

  it("returns -1 when nothing remains", () => {
    expect(nextActionableIndex([msg(0, "sent")], 0)).toBe(-1);
  });
});

describe("resumeIndex (campaign recovery)", () => {
  it("resumes at the stored index when it is still actionable", () => {
    const messages = [msg(0, "sent"), msg(1, "pending"), msg(2, "pending")];
    expect(resumeIndex(messages, 1)).toBe(1);
  });

  it("skips forward to the next actionable message when stored is processed", () => {
    const messages = [msg(0, "sent"), msg(1, "sent"), msg(2, "pending")];
    expect(resumeIndex(messages, 1)).toBe(2);
  });

  it("falls back to an earlier actionable message when later ones are done", () => {
    const messages = [msg(0, "pending"), msg(1, "sent"), msg(2, "sent")];
    expect(resumeIndex(messages, 2)).toBe(0);
  });

  it("clamps an out-of-range stored index", () => {
    const messages = [msg(0, "sent"), msg(1, "sent")];
    expect(resumeIndex(messages, 99)).toBe(1);
  });

  it("returns 0 for an empty campaign", () => {
    expect(resumeIndex([], 5)).toBe(0);
  });
});
