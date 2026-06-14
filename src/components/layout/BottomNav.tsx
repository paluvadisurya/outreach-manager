"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  UsersRound,
  Send,
  Phone,
  CalendarDays,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Extra path prefixes that should also mark this tab active. */
  match?: string[];
}

/** The top-level destinations. This is the entire application surface. */
// Templates is intentionally absent — template create/edit now lives inside the
// campaign flow (the chip-row gear + Add sheet) and the New Campaign flow.
const TABS: Tab[] = [
  { href: "/people", label: "People", icon: UsersRound, match: ["/contacts", "/categories"] },
  { href: "/campaigns", label: "Campaigns", icon: Send },
  { href: "/call", label: "Call", icon: Phone },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pt-2 pb-[max(0.55rem,env(safe-area-inset-bottom))]"
    >
      <ul className="flex w-full max-w-lg items-stretch justify-between gap-0.5 rounded-[1.9rem] border border-hairline bg-card p-1.5 shadow-float ring-1 ring-black/[0.03]">
        {TABS.map((tab) => {
          const prefixes = [tab.href, ...(tab.match ?? [])];
          const active = prefixes.some(
            (p) => pathname === p || pathname.startsWith(`${p}/`),
          );
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[58px] flex-col items-center justify-center gap-1.5 rounded-[1.45rem] px-1 py-2 text-[11px] font-medium leading-none transition-all duration-200 active:scale-95",
                  active
                    ? "bg-accent text-accent-foreground shadow-soft ring-1 ring-white/50"
                    : "text-muted-foreground hover:bg-white/50 hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "h-6 w-6 transition-transform duration-200",
                    active ? "scale-110 stroke-[2.4]" : "stroke-2",
                  )}
                  aria-hidden
                />
                <span className={cn("transition-all", active && "font-semibold")}>
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
