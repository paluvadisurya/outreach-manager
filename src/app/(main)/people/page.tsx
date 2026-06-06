"use client";

import { Suspense } from "react";
import { PeopleManager } from "@/features/people/components/PeopleManager";

export default function PeoplePage() {
  return (
    <Suspense fallback={null}>
      <PeopleManager />
    </Suspense>
  );
}
