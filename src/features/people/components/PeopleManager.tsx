"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Tags, Users, ListChecks } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { categoriesRepo } from "@/features/categories/lib/repository";
import { contactsRepo } from "@/features/contacts/lib/repository";
import { CategoriesManager } from "@/features/categories/components/CategoriesManager";
import { ContactsExplorer } from "@/features/contacts/components/ContactsExplorer";
import { CleanupTriage } from "@/features/contacts/components/CleanupTriage";

type Sub = "categories" | "contacts";

/**
 * The merged "People" surface. Categories is the default view (organise first),
 * with a quick segmented switch to the full Contacts list. Both children render
 * in embedded mode so this single header and tab strip stays put.
 */
export function PeopleManager() {
  const searchParams = useSearchParams();
  const [sub, setSub] = React.useState<Sub>(() =>
    searchParams.get("view") === "contacts" ? "contacts" : "categories",
  );
  const [cleanupOpen, setCleanupOpen] = React.useState(false);

  const categories = useLiveQuery(() => categoriesRepo.all(), []);
  const contacts = useLiveQuery(() => contactsRepo.all(), []);

  const isContacts = sub === "contacts";
  const subtitle = isContacts
    ? contacts
      ? `${contacts.length.toLocaleString()} contacts`
      : undefined
    : categories
      ? `${categories.length} categories`
      : undefined;

  const tabs: { key: Sub; label: string; icon: typeof Tags }[] = [
    { key: "categories", label: "Categories", icon: Tags },
    { key: "contacts", label: "Contacts", icon: Users },
  ];

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader
        title="People"
        icon={isContacts ? Users : Tags}
        subtitle={subtitle}
      />

      {/* Segmented sub-tabs */}
      <div className="px-5 py-3">
        <div className="flex gap-1 rounded-2xl bg-elevated p-1 ring-1 ring-inset ring-hairline">
          {tabs.map((t) => {
            const active = sub === t.key;
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setSub(t.key)}
                aria-pressed={active}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-[0.85rem] px-3 py-2 text-sm font-semibold transition-all active:scale-[0.98]",
                  active
                    ? "bg-card text-foreground shadow-soft ring-1 ring-hairline"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active panel */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {isContacts ? (
          <ContactsExplorer embedded />
        ) : (
          <CategoriesManager embedded />
        )}
      </div>

      {/* Cleanup lives as a floating action over the Categories view only, clear
          of the bottom nav (via --bottom-nav-gap), so organising is one tap away
          without crowding the header. */}
      {!isContacts && (
        <button
          type="button"
          onClick={() => {
            haptic("light");
            setCleanupOpen(true);
          }}
          aria-label="Clean up contacts"
          className="fixed bottom-[var(--bottom-nav-gap)] right-4 z-40 flex min-h-touch items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-float transition-transform active:scale-95"
        >
          <ListChecks className="h-5 w-5" />
          Clean up
        </button>
      )}

      <CleanupTriage open={cleanupOpen} onClose={() => setCleanupOpen(false)} />
    </div>
  );
}
