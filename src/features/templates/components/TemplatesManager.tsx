"use client";

import * as React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { LayoutTemplate, Plus, Braces } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { Template } from "@/lib/types";
import { templatesRepo } from "../lib/repository";
import { extractVariables, VARIABLE_LABELS } from "../lib/render";
import { TemplateEditor } from "./TemplateEditor";

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function TemplatesManager() {
  const templates = useLiveQuery(() => templatesRepo.all(), []);
  const [editing, setEditing] = React.useState<Template | null>(null);
  const [open, setOpen] = React.useState(false);

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };
  const openEdit = (t: Template) => {
    setEditing(t);
    setOpen(true);
  };

  return (
    <div className="flex flex-col">
      <AppHeader
        title="Templates"
        icon={LayoutTemplate}
        subtitle={templates ? `${templates.length} reusable messages` : undefined}
        action={
          <Button size="icon" onClick={openNew} aria-label="New template">
            <Plus className="h-5 w-5" />
          </Button>
        }
      />

      {templates && templates.length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          title="No templates yet"
          description="Write a reusable message with personalized fields like first name and company."
          action={
            <Button onClick={openNew}>
              <Plus className="h-5 w-5" />
              New template
            </Button>
          }
        />
      ) : (
        <div className="space-y-3 p-4 pb-nav">
          {templates?.map((t) => {
            const vars = extractVariables(t.body);
            const preview = t.body.replace(/\s+/g, " ").trim();
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => openEdit(t)}
                className="block w-full rounded-2xl border border-border/70 bg-card/80 p-4 text-left shadow-soft transition-all hover:shadow-card"
              >
                <div className="flex items-center gap-3">
                  <LayoutTemplate
                    className="h-6 w-6 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <p className="min-w-0 flex-1 truncate font-semibold text-foreground">
                    {t.name}
                  </p>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {relativeTime(t.updatedAt)}
                  </span>
                </div>
                <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                  {preview || "Empty template"}
                </p>
                {vars.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {vars.map((v) => (
                      <Badge key={v} variant="default">
                        <Braces className="h-3 w-3" />
                        {VARIABLE_LABELS[v]}
                      </Badge>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      <TemplateEditor
        open={open}
        template={editing}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
