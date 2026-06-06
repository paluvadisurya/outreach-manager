import * as React from "react";
import Link from "next/link";
import { Settings, type LucideIcon } from "lucide-react";
import { BackupButton } from "./BackupButton";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  /**
   * Section icon shown plainly left of the title, tinted with the active
   * section color so each tab reads distinctly while the header layout stays
   * identical everywhere (no shift between sections, no colored chrome).
   */
  icon?: LucideIcon;
  /** Optional trailing action (e.g. an add button). */
  action?: React.ReactNode;
  /** Hide the settings gear (defaults to shown). */
  hideSettings?: boolean;
  /** Hide the quick Save-backup button (defaults to shown). */
  hideBackup?: boolean;
}

/** A sticky, glassy page header used at the top of each tab. */
export function AppHeader({
  title,
  subtitle,
  icon: Icon,
  action,
  hideSettings,
  hideBackup,
}: AppHeaderProps) {
  return (
    <header className="glass sticky top-0 z-30 border-b border-border/60">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-5 pb-3 pt-[max(0.9rem,env(safe-area-inset-top))]">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <Icon
              aria-hidden
              className="h-7 w-7 shrink-0"
              strokeWidth={2}
              style={{ color: "hsl(var(--section))" }}
            />
          )}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight text-foreground">
              {title}
            </h1>
            {subtitle && (
              <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {action}
          {!hideBackup && <BackupButton />}
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
