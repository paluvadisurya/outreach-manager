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
      <Icon
        className="mb-5 h-12 w-12"
        strokeWidth={1.5}
        style={{ color: "hsl(var(--section))" }}
        aria-hidden
      />

      <h3 className="text-lg font-bold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
