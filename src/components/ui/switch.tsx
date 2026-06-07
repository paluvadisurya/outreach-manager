"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  "aria-label"?: string;
  disabled?: boolean;
}

/** A minimal, accessible toggle switch with a 48px-tall hit area. */
export function Switch({
  checked,
  onCheckedChange,
  id,
  disabled,
  ...rest
}: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={rest["aria-label"]}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50",
        checked
          ? "bg-primary shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)]"
          : "bg-input",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow-[0_1px_2px_rgba(16,24,40,0.25),0_2px_4px_rgba(16,24,40,0.12)] transition-transform duration-200 ease-out",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}
