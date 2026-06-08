"use client";

import * as React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Megaphone, ChevronRight } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { haptic } from "@/lib/haptics";
import { campaignsRepo } from "../lib/repository";

interface PickCampaignSheetProps {
  open: boolean;
  /** Contacts to add to whichever campaign is picked. */
  contactIds: string[];
  onClose: () => void;
  /** Called after a successful add (e.g. to clear the selection). */
  onDone?: () => void;
}

/**
 * Pick an existing campaign to drop the selected contacts into (Req #3, from the
 * Contacts tab). Tapping a campaign calls `campaignsRepo.addContacts`; new
 * messages render from that campaign's primary template and survive a refresh.
 */
export function PickCampaignSheet({
  open,
  contactIds,
  onClose,
  onDone,
}: PickCampaignSheetProps) {
  const campaigns = useLiveQuery(() => campaignsRepo.all(), []) ?? [];
  const [busy, setBusy] = React.useState(false);

  const add = async (campaignId: string, name: string) => {
    if (busy || contactIds.length === 0) return;
    setBusy(true);
    try {
      const count = await campaignsRepo.addContacts(campaignId, contactIds);
      haptic("success");
      if (typeof window !== "undefined") {
        window.alert(
          count === 0
            ? `Those contacts are already in “${name}”.`
            : `Added ${count} ${count === 1 ? "person" : "people"} to “${name}”.`,
        );
      }
      onDone?.();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add to campaign"
      description={`Add ${contactIds.length} ${contactIds.length === 1 ? "contact" : "contacts"} to an existing campaign.`}
    >
      {campaigns.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No campaigns yet. Create one with the “Campaign” button.
        </p>
      ) : (
        <ul className="space-y-2">
          {campaigns.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => add(c.id, c.name)}
                className="flex w-full items-center gap-3 rounded-2xl border border-hairline bg-card p-3 text-left transition-colors hover:bg-secondary disabled:opacity-50"
              >
                <Megaphone className="h-5 w-5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-foreground">
                    {c.name}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {c.sourceLabel} · {c.total} message{c.total === 1 ? "" : "s"}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
