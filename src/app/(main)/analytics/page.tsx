"use client";

import { Suspense } from "react";
import { AnalyticsManager } from "@/features/analytics/components/AnalyticsManager";

export default function AnalyticsPage() {
  return (
    <Suspense fallback={null}>
      <AnalyticsManager />
    </Suspense>
  );
}
