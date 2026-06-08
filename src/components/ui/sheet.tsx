"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  /**
   * Custom header content replacing the default title/description block (e.g. a
   * wrapping name with an inline action). `title` is still used for the dialog's
   * accessible label when provided.
   */
  header?: React.ReactNode;
  /** Optional action rendered in the header, just left of the close button. */
  headerAction?: React.ReactNode;
  /** Sticky footer (actions). Stays pinned above the safe area. */
  footer?: React.ReactNode;
}

/**
 * A mobile-first bottom sheet. Slides up from the bottom, fills most of the
 * viewport on phones, and keeps its primary actions pinned within thumb reach.
 * Built without external UI deps to keep the bundle lean.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  header,
  headerAction,
  footer,
}: SheetProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    // Anchor to a dynamic-viewport-height box so the sheet (and its footer) stay
    // within the *visible* area on iOS Safari, instead of being pushed behind the
    // browser toolbar by `100vh`.
    <div className="fixed inset-x-0 top-0 z-50 flex h-[100dvh] flex-col justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-foreground/40 backdrop-blur-[3px] animate-in fade-in duration-300"
        onClick={onClose}
        aria-hidden
        tabIndex={-1}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[2rem] border-t border-white/60 bg-card shadow-float",
          "animate-in slide-in-from-bottom duration-300",
        )}
      >
        <div className="flex justify-center pb-1 pt-3">
          <span className="h-1.5 w-11 rounded-full bg-border" aria-hidden />
        </div>
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-1">
          <div className="min-w-0 flex-1">
            {header ?? (
              <>
                {title && (
                  <h2 className="truncate text-xl font-bold tracking-tight text-foreground">
                    {title}
                  </h2>
                )}
                {description && (
                  <p className="mt-1 text-sm leading-snug text-muted-foreground">
                    {description}
                  </p>
                )}
              </>
            )}
          </div>
          <div className="-mr-2 flex shrink-0 items-center gap-0.5">
            {headerAction}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="border-t border-hairline bg-card px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
