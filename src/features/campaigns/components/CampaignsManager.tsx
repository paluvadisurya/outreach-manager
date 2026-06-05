"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Send, Plus, Play, ChevronRight, CheckCircle2 } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { campaignsRepo } from "../lib/repository";
import { computeProgress } from "../lib/progress";
import { CampaignCreateSheet } from "./CampaignCreateSheet";

export function CampaignsManager() {
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(false);

  const data = useLiveQuery(async () => {
    const campaigns = await campaignsRepo.all();
    const withProgress = await Promise.all(
      campaigns.map(async (c) => ({
        campaign: c,
        progress: computeProgress(await campaignsRepo.messagesFor(c.id)),
      })),
    );
    return withProgress;
  }, []);

  const resumable = data?.find(
    (d) => d.campaign.status !== "completed" && !d.progress.complete,
  );

  return (
    <div className="flex flex-col">
      <AppHeader
        title="Campaigns"
        action={
          <Button size="icon" onClick={() => setCreateOpen(true)} aria-label="New campaign">
            <Plus className="h-5 w-5" />
          </Button>
        }
      />

      {/* Resume banner — automatically surfaced when work is in progress. */}
      {resumable && (
        <div className="px-4 pt-4">
          <button
            type="button"
            onClick={() => router.push(`/campaigns/${resumable.campaign.id}`)}
            className="flex w-full items-center gap-3 rounded-2xl border border-primary/20 bg-accent p-4 text-left shadow-soft transition-all hover:shadow-card"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Play className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-accent-foreground">
                Resume campaign
              </span>
              <span className="block truncate font-semibold text-foreground">
                {resumable.campaign.name}
              </span>
              <span className="text-sm text-muted-foreground">
                {resumable.progress.processed} of {resumable.progress.total} done
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-primary" />
          </button>
        </div>
      )}

      {data && data.length === 0 ? (
        <EmptyState
          icon={Send}
          title="No campaigns yet"
          description="Combine a category and a template to generate personalized messages, then send them through WhatsApp."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-5 w-5" />
              New campaign
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3 p-4 pb-32">
          {data?.map(({ campaign, progress }) => (
            <li key={campaign.id}>
              <button
                type="button"
                onClick={() => router.push(`/campaigns/${campaign.id}`)}
                className="w-full rounded-2xl border border-border/70 bg-card/80 p-4 text-left shadow-soft transition-all hover:shadow-card"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-semibold text-foreground">
                    {campaign.name}
                  </p>
                  {progress.complete ? (
                    <Badge variant="success">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Done
                    </Badge>
                  ) : campaign.status === "paused" ? (
                    <Badge variant="secondary">Paused</Badge>
                  ) : (
                    <Badge>Active</Badge>
                  )}
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {campaign.sourceLabel}
                </p>
                <div className="mt-3">
                  <ProgressBar value={progress.fraction} />
                  <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
                    <span>
                      {progress.processed} of {progress.total}
                    </span>
                    <span>{progress.percent}%</span>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <CampaignCreateSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => router.push(`/campaigns/${id}`)}
      />
    </div>
  );
}
