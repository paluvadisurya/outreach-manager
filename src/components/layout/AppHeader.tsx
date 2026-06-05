import * as React from "react";
import Link from "next/link";
import { Settings } from "lucide-react";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  /** Optional trailing action (e.g. an add button). */
  action?: React.ReactNode;
  /** Hide the settings gear (defaults to shown). */
  hideSettings?: boolean;
}

/** A sticky, glassy page header used at the top of each tab. */
export function AppHeader({
  title,
  subtitle,
  action,
  hideSettings,
}: AppHeaderProps) {
  return (
    <header className="glass sticky top-0 z-30 border-b border-border/60">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-5 pb-3 pt-[max(0.9rem,env(safe-area-inset-top))]">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {!hideSettings && (
            <Link
              href="/settings"
              aria-label="Settings"
              className="flex min-h-touch min-w-touch items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Settings className="h-5 w-5" />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
