"use client";

import * as React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, CheckCheck, Star } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExpandableText } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { categoriesRepo } from "@/features/categories/lib/repository";
import { templatesRepo } from "@/features/templates/lib/repository";
import { contactsRepo } from "@/features/contacts/lib/repository";
import { personalizeContact } from "@/features/contacts/lib/name";
import { useSettings } from "@/features/settings/hooks/useSettings";
import { renderTemplate, tidyMessage } from "@/features/templates/lib/render";
import { campaignsRepo } from "../lib/repository";

interface CampaignCreateSheetProps {
  open: boolean;
  onClose: () => void;
  onCreated: (campaignId: string) => void;
  /** Pre-selected category (Campaigns/Categories tab). */
  defaultCategoryId?: string;
  /** Explicit contact selection (from a contact/call selection). */
  contactIds?: string[];
}

export function CampaignCreateSheet({
  open,
  onClose,
  onCreated,
  defaultCategoryId,
  contactIds,
}: CampaignCreateSheetProps) {
  const categories = useLiveQuery(() => categoriesRepo.all(), []) ?? [];
  const templates = useLiveQuery(() => templatesRepo.all(), []) ?? [];
  const settings = useSettings();

  const usingSelection = Array.isArray(contactIds);

  const [name, setName] = React.useState("");
  const [categoryIds, setCategoryIds] = React.useState<string[]>([]);
  const [templateIds, setTemplateIds] = React.useState<string[]>([]);
  const [primaryTemplateId, setPrimaryTemplateId] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName("");
      setCategoryIds(defaultCategoryId ? [defaultCategoryId] : []);
      setTemplateIds([]);
      setPrimaryTemplateId("");
    }
  }, [open, defaultCategoryId]);

  const toggleCategory = (id: string) =>
    setCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const allCategoriesSelected =
    categories.length > 0 && categories.every((c) => categoryIds.includes(c.id));
  const toggleAllCategories = () =>
    setCategoryIds(allCategoriesSelected ? [] : categories.map((c) => c.id));

  const allTemplatesSelected =
    templates.length > 0 && templates.every((t) => templateIds.includes(t.id));
  const toggleAllTemplates = () => {
    if (allTemplatesSelected) {
      setTemplateIds([]);
      setPrimaryTemplateId("");
    } else {
      const ids = templates.map((t) => t.id);
      setTemplateIds(ids);
      setPrimaryTemplateId((p) => p || ids[0] || "");
    }
  };

  // Toggling a template keeps a sensible primary: the first selected becomes
  // primary; removing the primary promotes whatever remains.
  const toggleTemplate = (id: string) =>
    setTemplateIds((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        setPrimaryTemplateId((p) => (p === id ? (next[0] ?? "") : p));
        return next;
      }
      setPrimaryTemplateId((p) => p || id);
      return [...prev, id];
    });

  // Live preview against the first contact of the chosen source, primary template.
  const preview = useLiveQuery(async () => {
    if (!primaryTemplateId) return null;
    const template = await templatesRepo.get(primaryTemplateId);
    if (!template) return null;
    let sampleId: string | undefined;
    let count = 0;
    if (usingSelection) {
      sampleId = contactIds?.[0];
      count = contactIds?.length ?? 0;
    } else if (categoryIds.length) {
      // De-duplicated union across the chosen groups.
      const seen = new Set<string>();
      for (const categoryId of categoryIds) {
        for (const c of await contactsRepo.inCategory(categoryId)) {
          if (!seen.has(c.id)) {
            seen.add(c.id);
            if (!sampleId) sampleId = c.id;
          }
        }
      }
      count = seen.size;
    }
    const sample = sampleId ? await contactsRepo.get(sampleId) : undefined;
    const text = sample
      ? tidyMessage(
          renderTemplate(template.body, personalizeContact(sample, settings))
            .text,
        )
      : tidyMessage(template.body);
    return { text, count };
  }, [primaryTemplateId, categoryIds.join(","), usingSelection, contactIds?.join(","), settings]);

  const canCreate =
    name.trim().length > 0 &&
    templateIds.length > 0 &&
    (usingSelection ? (contactIds?.length ?? 0) > 0 : categoryIds.length > 0);

  async function create() {
    if (!canCreate) return;
    setBusy(true);
    try {
      const campaign = await campaignsRepo.create({
        name,
        templateIds,
        primaryTemplateId,
        categoryIds: usingSelection ? undefined : categoryIds,
        contactIds: usingSelection ? contactIds : undefined,
      });
      onCreated(campaign.id);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New campaign"
      description="Combine a contact source and one or more templates to generate messages."
      footer={
        <Button className="w-full" disabled={!canCreate || busy} onClick={create}>
          {busy
            ? "Generating…"
            : `Generate${preview?.count ? ` ${preview.count}` : ""} message${
                preview?.count === 1 ? "" : "s"
              }`}
        </Button>
      }
    >
      <div className="space-y-5">
        <Field label="Campaign name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Whitefield Villa Launch"
          />
        </Field>

        {usingSelection ? (
          <Field label="Contacts">
            <p className="text-sm text-muted-foreground">
              {contactIds?.length ?? 0} selected contacts
            </p>
          </Field>
        ) : (
          <Field
            label={`Groups${categoryIds.length ? ` · ${categoryIds.length} selected` : ""}`}
            action={
              categories.length > 1 ? (
                <SelectAllButton
                  active={allCategoriesSelected}
                  onClick={toggleAllCategories}
                />
              ) : undefined
            }
          >
            <div className="space-y-2">
              {categories.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No categories yet. Create one from the People tab.
                </p>
              )}
              {categories.map((c) => (
                <SelectRow
                  key={c.id}
                  label={c.name}
                  selected={categoryIds.includes(c.id)}
                  onClick={() => toggleCategory(c.id)}
                />
              ))}
            </div>
          </Field>
        )}

        <Field
          label={`Templates${templateIds.length ? ` · ${templateIds.length} selected` : ""}`}
          action={
            templates.length > 1 ? (
              <SelectAllButton
                active={allTemplatesSelected}
                onClick={toggleAllTemplates}
              />
            ) : undefined
          }
        >
          <div className="space-y-2">
            {templates.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No templates yet. Create one from the Templates tab.
              </p>
            )}
            {templates.map((t) => {
              const selected = templateIds.includes(t.id);
              const isPrimary = primaryTemplateId === t.id;
              return (
                <div
                  key={t.id}
                  className={cn(
                    "flex items-center gap-2 rounded-2xl border px-2.5 transition-all",
                    selected
                      ? "border-primary/40 bg-accent ring-1 ring-primary/15"
                      : "border-hairline bg-card",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleTemplate(t.id)}
                    className="flex min-h-touch flex-1 items-center justify-between gap-2 text-left text-sm"
                  >
                    <span className="truncate text-foreground">{t.name}</span>
                    {selected && (
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                    )}
                  </button>
                  {/* Star marks the primary (default) template. */}
                  {selected && (
                    <button
                      type="button"
                      onClick={() => setPrimaryTemplateId(t.id)}
                      aria-label={
                        isPrimary ? "Primary template" : "Set as primary template"
                      }
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl hover:bg-secondary"
                    >
                      <Star
                        className={cn(
                          "h-4 w-4",
                          isPrimary
                            ? "fill-amber-400 text-amber-500"
                            : "text-muted-foreground",
                        )}
                      />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {templateIds.length > 1 && (
            <p className="text-xs text-muted-foreground">
              The starred template is the default for everyone. You can switch a
              person to another template while sending.
            </p>
          )}
        </Field>

        {preview && (
          <Field label="Preview">
            <div className="rounded-2xl border border-hairline bg-elevated p-3.5 text-sm text-foreground ring-1 ring-inset ring-hairline">
              <ExpandableText text={preview.text || "—"} lines={6} />
            </div>
          </Field>
        )}
      </div>
    </Sheet>
  );
}

function Field({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium text-foreground">{label}</label>
        {action}
      </div>
      {children}
    </div>
  );
}

function SelectAllButton({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
    >
      <CheckCheck className="h-3.5 w-3.5" />
      {active ? "Clear all" : "Select all"}
    </button>
  );
}

function SelectRow({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-touch w-full items-center justify-between rounded-2xl border px-3.5 text-left text-sm font-medium transition-all active:scale-[0.99]",
        selected
          ? "border-primary/40 bg-accent text-accent-foreground ring-1 ring-primary/15"
          : "border-hairline bg-card text-foreground hover:bg-secondary",
      )}
    >
      <span className="truncate">{label}</span>
      {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
    </button>
  );
}
