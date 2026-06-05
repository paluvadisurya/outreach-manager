"use client";

import * as React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  /** Pre-selected category (Campaigns tab). */
  defaultCategoryId?: string;
  /** Explicit contact selection (from the contact explorer). */
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
  const [categoryId, setCategoryId] = React.useState(defaultCategoryId ?? "");
  const [templateId, setTemplateId] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName("");
      setCategoryId(defaultCategoryId ?? "");
      setTemplateId("");
    }
  }, [open, defaultCategoryId]);

  // Live preview against the first contact of the chosen source.
  const preview = useLiveQuery(async () => {
    if (!templateId) return null;
    const template = await templatesRepo.get(templateId);
    if (!template) return null;
    let sampleId: string | undefined;
    let count = 0;
    if (usingSelection) {
      sampleId = contactIds?.[0];
      count = contactIds?.length ?? 0;
    } else if (categoryId) {
      const inCat = await contactsRepo.inCategory(categoryId);
      sampleId = inCat[0]?.id;
      count = inCat.length;
    }
    const sample = sampleId ? await contactsRepo.get(sampleId) : undefined;
    const text = sample
      ? tidyMessage(
          renderTemplate(template.body, personalizeContact(sample, settings))
            .text,
        )
      : tidyMessage(template.body);
    return { text, count };
  }, [templateId, categoryId, usingSelection, contactIds?.join(","), settings]);

  const canCreate =
    name.trim().length > 0 &&
    templateId.length > 0 &&
    (usingSelection ? (contactIds?.length ?? 0) > 0 : categoryId.length > 0);

  async function create() {
    if (!canCreate) return;
    setBusy(true);
    try {
      const campaign = await campaignsRepo.create({
        name,
        templateId,
        categoryId: usingSelection ? undefined : categoryId,
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
      description="Combine a contact source and a template to generate messages."
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
          <Field label="Category">
            <div className="space-y-2">
              {categories.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No categories yet. Create one from the Contacts tab.
                </p>
              )}
              {categories.map((c) => (
                <SelectRow
                  key={c.id}
                  label={c.name}
                  selected={categoryId === c.id}
                  onClick={() => setCategoryId(c.id)}
                />
              ))}
            </div>
          </Field>
        )}

        <Field label="Template">
          <div className="space-y-2">
            {templates.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No templates yet. Create one from the Templates tab.
              </p>
            )}
            {templates.map((t) => (
              <SelectRow
                key={t.id}
                label={t.name}
                selected={templateId === t.id}
                onClick={() => setTemplateId(t.id)}
              />
            ))}
          </div>
        </Field>

        {preview && (
          <Field label="Preview">
            <div className="whitespace-pre-wrap rounded-lg border border-border bg-secondary/40 p-3 text-sm text-foreground">
              {preview.text || "—"}
            </div>
          </Field>
        )}
      </div>
    </Sheet>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
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
        "flex min-h-touch w-full items-center justify-between rounded-lg border px-3 text-left text-sm transition-colors",
        selected
          ? "border-primary bg-accent text-accent-foreground"
          : "border-input bg-card text-foreground hover:bg-secondary",
      )}
    >
      <span className="truncate">{label}</span>
      {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
    </button>
  );
}
