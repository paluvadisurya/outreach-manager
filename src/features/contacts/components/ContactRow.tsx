"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Contact } from "@/lib/types";
import { initials, tintFor } from "../lib/avatar";

interface ContactRowProps {
  contact: Contact;
  selected: boolean;
  onToggle: () => void;
}

export const ContactRow = React.memo(function ContactRow({
  contact,
  selected,
  onToggle,
}: ContactRowProps) {
  const subtitle = [contact.designation, contact.company]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="px-1 py-1">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        className={cn(
          "flex h-[68px] w-full items-center gap-3 rounded-2xl px-3 text-left transition-all",
          selected
            ? "bg-accent ring-1 ring-primary/30"
            : "hover:bg-card hover:shadow-soft",
        )}
      >
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold transition-colors",
            selected ? "bg-primary text-primary-foreground" : tintFor(contact.id),
          )}
          aria-hidden
        >
          {selected ? <Check className="h-5 w-5" /> : initials(contact.fullName)}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-foreground">
            {contact.fullName || contact.phone}
          </span>
          <span className="block truncate text-sm text-muted-foreground">
            {subtitle || contact.phone}
          </span>
        </span>

        {contact.categoryIds.length > 0 && (
          <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
            {contact.categoryIds.length}
          </span>
        )}
      </button>
    </div>
  );
});
