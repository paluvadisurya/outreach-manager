import * as React from "react";
import Link from "next/link";
import { Settings, Activity, type LucideIcon } from "lucide-react";
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
  /** Hide the Analytics shortcut (defaults to shown; hidden on the Analytics page). */
  hideAnalytics?: boolean;
}

/** A sticky, glassy page header used at the top of each tab. */
export function AppHeader({
  title,
  subtitle,
  icon: Icon,
  action,
  hideSettings,
  hideBackup,
  hideAnalytics,
}: AppHeaderProps) {
  return (
    <header className="glass sticky top-0 z-30 border-b border-border/50">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-2 px-4 pb-3.5 pt-[max(0.85rem,env(safe-area-inset-top))]">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && (
            // The section-identity "app icon" bubble: a soft gradient tile that
            // gives each tab a distinct, premium signature while the header
            // structure stays identical everywhere (no layout shift).
            <span
              aria-hidden
              className="section-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.8rem] shadow-soft ring-1 ring-white/30"
            >
              <Icon className="h-5 w-5 text-white" strokeWidth={2.1} />
            </span>
          )}
          <div className="min-w-0">
            {/* Wrap to two lines on a narrow screen instead of clipping mid-word
                (e.g. "Templates" → "Templ…"); scale down the display size on
                small phones so the title + trailing controls all fit. */}
            <h1 className="text-xl font-bold leading-tight tracking-tight text-foreground line-clamp-2 sm:text-2xl">
              {title}
            </h1>
            {subtitle && (
              <p className="truncate text-sm font-medium text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {action}
          {!hideAnalytics && (
            <Link
              href="/analytics"
              aria-label="Analytics"
              className="flex min-h-touch min-w-touch items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground active:scale-95"
            >
              <Activity className="h-5 w-5" />
            </Link>
          )}
          {!hideBackup && <BackupButton />}
          {!hideSettings && (
            <Link
              href="/settings"
              aria-label="Settings"
              className="flex min-h-touch min-w-touch items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground active:scale-95"
            >
              <Settings className="h-5 w-5" />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
