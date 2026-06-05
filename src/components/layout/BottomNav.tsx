"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Tags, FileText, Send, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** The four top-level destinations. This is the entire application surface. */
const TABS: Tab[] = [
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/templates", label: "Templates", icon: FileText },
  { href: "/campaigns", label: "Campaigns", icon: Send },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 mb-safe flex justify-center px-4 pb-4 pt-2"
    >
      <ul className="flex w-full max-w-md items-stretch justify-between gap-1 rounded-[1.75rem] border border-border bg-card p-2 shadow-float">
        {TABS.map((tab) => {
          const active =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-[1.35rem] px-1 py-2 text-[11px] font-medium transition-all duration-200",
                  active
                    ? "bg-accent text-accent-foreground shadow-soft"
                    : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "h-[22px] w-[22px] transition-transform",
                    active ? "scale-110 stroke-[2.4]" : "stroke-2",
                  )}
                  aria-hidden
                />
                <span className={cn(active && "font-semibold")}>
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
