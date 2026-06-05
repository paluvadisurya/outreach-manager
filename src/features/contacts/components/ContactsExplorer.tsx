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
  Users,
} from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { VirtualList } from "@/components/ui/virtual-list";
import type { Contact } from "@/lib/types";
import { contactsRepo } from "../lib/repository";
import { filterContacts, selectSearchResults } from "../lib/search";
import { useSelectionStore } from "../store/selection";
import { ImportSheet } from "./ImportSheet";
import { ContactRow } from "./ContactRow";
import { AssignCategorySheet } from "./AssignCategorySheet";
import { CampaignCreateSheet } from "@/features/campaigns/components/CampaignCreateSheet";
import { loadDemoData } from "@/lib/seed";

const ROW_HEIGHT = 76;

export function ContactsExplorer() {
  const router = useRouter();
  const contacts = useLiveQuery(() => contactsRepo.all(), []);
  const { query, setQuery, selected, toggle, setSelection, clear, isSelected } =
    useSelectionStore();

  const [importOpen, setImportOpen] = React.useState(false);
  const [assignMode, setAssignMode] = React.useState<"add" | "remove" | null>(
    null,
  );
  const [campaignOpen, setCampaignOpen] = React.useState(false);

  const filtered = React.useMemo(
    () => filterContacts(contacts ?? [], query),
    [contacts, query],
  );

  const selectedIds = React.useMemo(() => [...selected], [selected]);
  const hasSelection = selectedIds.length > 0;
  const searching = query.trim().length > 0;

  const handleSelectSearchResults = () => {
    setSelection(selectSearchResults(filtered, query));
  };

  const loading = contacts === undefined;

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader
        title="Contacts"
        subtitle={
          contacts ? `${contacts.length.toLocaleString()} total` : undefined
        }
        action={
          <Button size="icon" onClick={() => setImportOpen(true)} aria-label="Import contacts">
            <Upload className="h-5 w-5" />
          </Button>
        }
      />

      {/* Search */}
      <div className="border-b border-border/60 px-5 pb-3 pt-1">
        <div className="relative">
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

        {searching && (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              {filtered.length.toLocaleString()} result
              {filtered.length === 1 ? "" : "s"}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSelectSearchResults}
              disabled={filtered.length === 0}
            >
              <CheckCheck className="h-4 w-4" />
              Select results
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
            className="h-full px-3 pb-40 pt-1"
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

      {/* Floating selection action bar — sits just above the bottom nav */}
      {hasSelection && (
        <div className="fixed inset-x-0 bottom-[104px] z-40 flex justify-center px-4">
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
              <Button size="sm" variant="outline" onClick={() => setAssignMode("add")}>
                <FolderPlus className="h-4 w-4" />
                Add
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAssignMode("remove")}
              >
                <FolderMinus className="h-4 w-4" />
              </Button>
              <Button size="sm" onClick={() => setCampaignOpen(true)}>
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
    </div>
  );
}
