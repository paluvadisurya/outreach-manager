"use client";

import { Suspense } from "react";
import { CallManager } from "@/features/calls/components/CallManager";

export default function CallPage() {
  return (
    <Suspense fallback={null}>
      <CallManager />
    </Suspense>
  );
}
