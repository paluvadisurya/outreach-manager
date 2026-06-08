"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Search,
  Upload,
  X,
  CheckCheck,
  FolderPlus,
  FolderMinus,
  Send,
  Megaphone,
  Users,
  UserMinus,
} from "lucide-react";
import { haptic } from "@/lib/haptics";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { VirtualList } from "@/components/ui/virtual-list";
import type { Contact } from "@/lib/types";
import { contactsRepo } from "../lib/repository";
import { filterContacts } from "../lib/search";
import { useSelectionStore } from "../store/selection";
import { ImportSheet } from "./ImportSheet";
import { ContactRow } from "./ContactRow";
import { AssignCategorySheet } from "./AssignCategorySheet";
import { CampaignCreateSheet } from "@/features/campaigns/components/CampaignCreateSheet";
import { PickCampaignSheet } from "@/features/campaigns/components/PickCampaignSheet";
import { loadDemoData } from "@/lib/seed";

const ROW_HEIGHT = 76;

export function ContactsExplorer({ embedded = false }: { embedded?: boolean } = {}) {
  const router = useRouter();
  const contacts = useLiveQuery(() => contactsRepo.all(), []);
  const { query, setQuery, selected, toggle, toggleAll, clear, isSelected } =
    useSelectionStore();

  const [importOpen, setImportOpen] = React.useState(false);
  const [assignMode, setAssignMode] = React.useState<"add" | "remove" | null>(
    null,
  );
  const [campaignOpen, setCampaignOpen] = React.useState(false);
  const [pickCampaignOpen, setPickCampaignOpen] = React.useState(false);

  const filtered = React.useMemo(
    () => filterContacts(contacts ?? [], query),
    [contacts, query],
  );

  const selectedIds = React.useMemo(() => [...selected], [selected]);
  const hasSelection = selectedIds.length > 0;
  const searching = query.trim().length > 0;

  const filteredIds = React.useMemo(() => filtered.map((c) => c.id), [filtered]);
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));

  const handleToggleAll = () => {
    haptic("light");
    toggleAll(filteredIds);
  };

  // Soft-remove the selected contacts everywhere (no WhatsApp / out of domain).
  // Recoverable from Settings → Removed contacts.
  const handleRemove = async () => {
    const n = selectedIds.length;
    if (n === 0) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Remove ${n} contact${n === 1 ? "" : "s"}? They'll be hidden from all lists and skipped on future imports. You can restore them from Settings → Removed contacts.`,
      )
    ) {
      return;
    }
    haptic("warning");
    await contactsRepo.remove(selectedIds);
    clear();
  };

  const loading = contacts === undefined;

  return (
    <div className={embedded ? "flex h-full min-h-0 flex-col" : "flex h-dvh flex-col"}>
      {!embedded && (
        <AppHeader
          title="Contacts"
          icon={Users}
          subtitle={
            contacts ? `${contacts.length.toLocaleString()} total` : undefined
          }
          action={
            <Button size="icon" onClick={() => setImportOpen(true)} aria-label="Import contacts">
              <Upload className="h-5 w-5" />
            </Button>
          }
        />
      )}

      {/* Search */}
      <div className="border-b border-border/60 px-5 pb-3 pt-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, phone, company…"
              className="pl-11 pr-11"
              inputMode="search"
            />
            {searching && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {embedded && (
            <Button
              size="icon"
              variant="outline"
              onClick={() => setImportOpen(true)}
              aria-label="Import contacts"
            >
              <Upload className="h-5 w-5" />
            </Button>
          )}
        </div>

        {(contacts?.length ?? 0) > 0 && (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              {searching
                ? `${filtered.length.toLocaleString()} result${filtered.length === 1 ? "" : "s"}`
                : `${(contacts?.length ?? 0).toLocaleString()} contact${(contacts?.length ?? 0) === 1 ? "" : "s"}`}
            </span>
            <Button
              size="sm"
              variant={allFilteredSelected ? "secondary" : "outline"}
              onClick={handleToggleAll}
              disabled={filtered.length === 0}
            >
              <CheckCheck className="h-4 w-4" />
              {allFilteredSelected
                ? "Deselect all"
                : searching
                  ? "Select all results"
                  : "Select all"}
            </Button>
          </div>
        )}
      </div>

      {/* List */}
      <div className="relative flex-1 overflow-hidden">
        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        ) : (contacts?.length ?? 0) === 0 ? (
          <EmptyState
            icon={Users}
            title="No contacts yet"
            description="Import a .vcf file to bring in your buyers, investors and referral partners."
            action={
              <div className="flex flex-col items-center gap-2">
                <Button onClick={() => setImportOpen(true)}>
                  <Upload className="h-5 w-5" />
                  Import contacts
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void loadDemoData()}
                >
                  Load demo data
                </Button>
              </div>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No matches"
            description={`Nothing matched “${query}”.`}
          />
        ) : (
          <VirtualList<Contact>
            className="h-full px-3 pb-nav pt-1"
            items={filtered}
            itemHeight={ROW_HEIGHT}
            getKey={(c) => c.id}
            renderItem={(c) => (
              <ContactRow
                contact={c}
                selected={isSelected(c.id)}
                onToggle={() => toggle(c.id)}
              />
            )}
          />
        )}
      </div>

      {/* Floating selection action bar — sits just above the bottom nav. The
          offset matches the nav clearance (incl. the iOS safe-area inset) so it
          never overlaps the nav on a real phone, only in desktop testing. */}
      {hasSelection && (
        <div className="fixed inset-x-0 bottom-[var(--bottom-nav-gap)] z-40 flex justify-center px-4">
          <div className="glass flex w-full max-w-md items-center gap-2 rounded-2xl border border-white/60 px-3 py-2 shadow-float animate-in slide-in-from-bottom-2">
            <button
              type="button"
              onClick={clear}
              className="flex items-center gap-1.5 rounded-xl bg-secondary px-2.5 py-1.5 text-sm font-semibold text-foreground hover:bg-secondary/70"
            >
              <X className="h-4 w-4" />
              {selectedIds.length}
            </button>
            <div className="ml-auto flex gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAssignMode("add")}
                aria-label="Add to category"
              >
                <FolderPlus className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAssignMode("remove")}
                aria-label="Remove from category"
              >
                <FolderMinus className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRemove}
                aria-label="Remove contacts"
              >
                <UserMinus className="h-4 w-4 text-destructive" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  haptic("light");
                  setPickCampaignOpen(true);
                }}
                aria-label="Add to existing campaign"
              >
                <Megaphone className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  haptic("light");
                  setCampaignOpen(true);
                }}
              >
                <Send className="h-4 w-4" />
                Campaign
              </Button>
            </div>
          </div>
        </div>
      )}

      <ImportSheet
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {}}
      />

      <AssignCategorySheet
        open={assignMode !== null}
        mode={assignMode ?? "add"}
        contactIds={selectedIds}
        onClose={() => setAssignMode(null)}
        onDone={clear}
      />

      <CampaignCreateSheet
        open={campaignOpen}
        contactIds={selectedIds}
        onClose={() => setCampaignOpen(false)}
        onCreated={(id) => {
          clear();
          router.push(`/campaigns/${id}`);
        }}
      />

      <PickCampaignSheet
        open={pickCampaignOpen}
        contactIds={selectedIds}
        onClose={() => setPickCampaignOpen(false)}
        onDone={clear}
      />
    </div>
  );
}
