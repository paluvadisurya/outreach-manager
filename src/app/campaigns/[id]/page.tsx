"use client";

import { Suspense, use } from "react";
import { SendingQueue } from "@/features/campaigns/components/SendingQueue";

export default function CampaignQueuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense fallback={null}>
      <SendingQueue campaignId={id} />
    </Suspense>
  );
}
