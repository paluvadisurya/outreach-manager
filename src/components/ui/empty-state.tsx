import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/** A calm, centered placeholder shown when a list has no items yet. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-20 text-center",
        className,
      )}
    >
      {/* A glowing gradient "app tile" behind the icon — the same section
          identity treatment as the header bubble, for a cohesive premium feel. */}
      <div className="relative mb-6 flex h-20 w-20 items-center justify-center">
        <div
          className="absolute inset-0 rounded-[2rem] opacity-20 blur-2xl"
          style={{ backgroundColor: "hsl(var(--section))" }}
          aria-hidden
        />
        <div className="section-gradient relative flex h-16 w-16 items-center justify-center rounded-[1.4rem] shadow-soft ring-1 ring-white/40">
          <Icon className="h-8 w-8 text-white" strokeWidth={1.75} aria-hidden />
        </div>
      </div>

      <h3 className="text-lg font-bold tracking-tight text-foreground">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-7">{action}</div>}
    </div>
  );
}
