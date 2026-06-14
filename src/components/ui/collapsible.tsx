"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleProps {
  title: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  /** Closed by default — the whole point is to keep actions within reach. */
  defaultOpen?: boolean;
  /** Small text shown on the right of the header when collapsed (e.g. a count). */
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * A standard disclosure panel: a tappable header with a rotating chevron and
 * content that mounts only when open. Matches the inline pattern the Calendar's
 * "View calendar" toggle already uses, so the app reads consistently.
 */
export function Collapsible({
  title,
  icon: Icon,
  defaultOpen = false,
  hint,
  children,
  className,
}: CollapsibleProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-2xl border border-hairline bg-card px-4 py-3.5 shadow-soft transition-all hover:bg-secondary/40 active:scale-[0.99]"
      >
        <span className="flex min-w-0 items-center gap-2 font-semibold text-foreground">
          {Icon && <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />}
          <span className="truncate">{title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
          {hint}
          <ChevronDown
            className={cn("h-5 w-5 transition-transform", open && "rotate-180")}
          />
        </span>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

interface ExpandableTextProps {
  text: string;
  /** Number of lines to show when collapsed. */
  lines?: number;
  /** Classes applied to the text element (font, colors, whitespace handling). */
  className?: string;
  /**
   * Extra classes applied to the text element ONLY while expanded — e.g. a
   * `max-h-…` + `overflow-y-auto` so a very long message scrolls within itself
   * instead of pushing the surrounding layout.
   */
  expandedClassName?: string;
  /** Classes for the show-more/less toggle. */
  toggleClassName?: string;
  defaultExpanded?: boolean;
  moreLabel?: string;
  lessLabel?: string;
}

/**
 * Clamp long text to a few lines with a "Show full message / Show less" toggle.
 * Collapsed by default so the surrounding action buttons stay reachable without
 * scrolling on smaller phones. The toggle only appears when the text actually
 * overflows the clamp.
 */
export function ExpandableText({
  text,
  lines = 6,
  className,
  expandedClassName,
  toggleClassName,
  defaultExpanded = false,
  moreLabel = "Show full message",
  lessLabel = "Show less",
}: ExpandableTextProps) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const [overflowing, setOverflowing] = React.useState(false);
  const ref = React.useRef<HTMLParagraphElement>(null);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (expanded) return; // while expanded there's no clamp to measure
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [text, lines, expanded]);

  const clampStyle: React.CSSProperties = expanded
    ? {}
    : {
        display: "-webkit-box",
        WebkitLineClamp: lines,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      };

  return (
    <div>
      <p
        ref={ref}
        className={cn(
          "whitespace-pre-wrap",
          className,
          expanded && expandedClassName,
        )}
        style={clampStyle}
      >
        {text}
      </p>
      {(overflowing || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className={cn(
            "mt-1.5 text-xs font-semibold text-primary hover:underline",
            toggleClassName,
          )}
        >
          {expanded ? lessLabel : moreLabel}
        </button>
      )}
    </div>
  );
}
