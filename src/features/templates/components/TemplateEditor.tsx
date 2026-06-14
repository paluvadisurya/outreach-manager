"use client";

import * as React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Trash2,
  Shuffle,
  Plus,
  Check,
  Bot,
  ClipboardPaste,
  Eraser,
  ChevronDown,
} from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ExpandableText } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { Contact, Template, TemplateVariable } from "@/lib/types";
import { contactsRepo } from "@/features/contacts/lib/repository";
import { personalizeContact } from "@/features/contacts/lib/name";
import { useSettings } from "@/features/settings/hooks/useSettings";
import { haptic } from "@/lib/haptics";
import { templatesRepo } from "../lib/repository";
import {
  TEMPLATE_VARIABLES,
  VARIABLE_LABELS,
  buildRephrasePrompt,
  renderTemplate,
  stripCodeFences,
  tidyMessage,
} from "../lib/render";

interface TemplateEditorProps {
  open: boolean;
  template: Template | null;
  onClose: () => void;
  /**
   * When true, show a picker in the name section to switch between "New
   * template" and any existing template, editing the chosen one in place. Used
   * by the in-campaign Add flow so template management lives there (the standalone
   * Templates tab was removed).
   */
  selectable?: boolean;
}

/** A fictional contact so the preview is meaningful before any import. */
const SAMPLE_CONTACT: Partial<Contact> = {
  firstName: "Ramesh",
  lastName: "Kumar",
  fullName: "Ramesh Kumar",
  phone: "+91 98765 43210",
  email: "ramesh@example.com",
  company: "Kumar Estates",
  designation: "Director",
};

export function TemplateEditor({
  open,
  template,
  onClose,
  selectable = false,
}: TemplateEditorProps) {
  const contacts = useLiveQuery(() => contactsRepo.all(), []) ?? [];
  const allTemplates =
    useLiveQuery(() => templatesRepo.all(), [], [] as Template[]) ?? [];
  const settings = useSettings();
  const [name, setName] = React.useState("");
  const [body, setBody] = React.useState("");
  // Which template is being edited (null = creating a new one). Drives both the
  // picker selection and what Save writes.
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [sampleIndex, setSampleIndex] = React.useState(0);
  const [notice, setNotice] = React.useState<string | null>(null);
  // The custom (non-native) template picker popup in the name section.
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const selectionRef = React.useRef<{ start: number; end: number }>({
    start: 0,
    end: 0,
  });

  React.useEffect(() => {
    if (open) {
      setName(template?.name ?? "");
      setBody(template?.body ?? "");
      setEditingId(template?.id ?? null);
      setSampleIndex(0);
      setNotice(null);
    }
  }, [open, template]);

  // Switch the picker to "New" or an existing template, loading its content so
  // edits update that template in place on Save.
  const loadTemplate = (id: string | null) => {
    setEditingId(id);
    const picked = id ? allTemplates.find((t) => t.id === id) : null;
    setName(picked?.name ?? "");
    setBody(picked?.body ?? "");
    setNotice(null);
  };

  const sample: Partial<Contact> =
    contacts.length > 0
      ? contacts[sampleIndex % contacts.length]!
      : SAMPLE_CONTACT;

  const rendered = React.useMemo(
    () => renderTemplate(body, personalizeContact(sample, settings)),
    [body, sample, settings],
  );

  const rememberSelection = () => {
    const el = textareaRef.current;
    if (!el) return;
    selectionRef.current = { start: el.selectionStart, end: el.selectionEnd };
  };

  /**
   * Parameterize: replace the current text selection with a variable token, or
   * insert it at the cursor when nothing is selected.
   */
  const insertVariable = (variable: TemplateVariable) => {
    const { start, end } = selectionRef.current;
    const token = `{{${variable}}}`;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      const pos = start + token.length;
      el.focus();
      el.setSelectionRange(pos, pos);
      selectionRef.current = { start: pos, end: pos };
    });
  };

  /**
   * Rephrase via ChatGPT: open ChatGPT in a new tab with the ready-made prompt
   * (instructions + the current body, with its {{tokens}} intact) carried in the
   * `?q=` query param so it lands pre-filled. We also copy the prompt to the
   * clipboard as a silent fallback in case the param doesn't survive a redirect
   * (e.g. a sign-in bounce). The user copies ChatGPT's reply and taps "Paste".
   */
  const rephraseWithGpt = async () => {
    haptic("light");
    const prompt = buildRephrasePrompt(body);
    // Best-effort clipboard backup; ignore failures (param is the primary path).
    void navigator.clipboard?.writeText(prompt).catch(() => {});
    const url = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  /** Paste the rephrased reply from the clipboard, stripping any code fence. */
  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setBody(stripCodeFences(text));
        setNotice(null);
        haptic("success");
      } else {
        setNotice("Clipboard is empty. Copy the rephrased message first.");
      }
    } catch {
      setNotice(
        "Couldn't read the clipboard. Paste the message into the box manually.",
      );
    }
  };

  /** Wipe the message box so a fresh (e.g. rephrased) version can be pasted in. */
  const clearBody = () => {
    if (
      body.trim().length > 0 &&
      typeof window !== "undefined" &&
      !window.confirm("Clear the message box?")
    ) {
      return;
    }
    setBody("");
    setNotice(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const save = async () => {
    if (editingId) {
      await templatesRepo.update(editingId, { name, body });
    } else {
      await templatesRepo.create(name || "Untitled template", body);
    }
    onClose();
  };

  const remove = async () => {
    if (!editingId) return;
    const editingName =
      allTemplates.find((t) => t.id === editingId)?.name ?? "this template";
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete template “${editingName}”?`)
    ) {
      return;
    }
    await templatesRepo.delete(editingId);
    onClose();
  };

  const canSave = name.trim().length > 0 && body.trim().length > 0;
  const hasSelection =
    selectionRef.current.end > selectionRef.current.start;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editingId ? "Edit template" : "New template"}
      footer={
        <div className="flex gap-3">
          {editingId && (
            <Button variant="outline" size="icon" onClick={remove} aria-label="Delete template">
              <Trash2 className="h-5 w-5 text-destructive" />
            </Button>
          )}
          <Button className="flex-1" onClick={save} disabled={!canSave}>
            <Check className="h-5 w-5" />
            {editingId ? "Save changes" : "Save template"}
          </Button>
        </div>
      }
    >
      <div className="-mt-1 space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="text-sm font-semibold text-foreground">
              Template name
            </label>
            {/* Custom (non-native) picker next to the title: start fresh or load
                an existing template to edit it in place — the standalone
                Templates tab was removed. */}
            {selectable && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPickerOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={pickerOpen}
                  className="flex items-center gap-1 rounded-xl bg-secondary px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary/70"
                >
                  {editingId ? "Editing existing" : "New template"}
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 text-muted-foreground transition-transform",
                      pickerOpen && "rotate-180",
                    )}
                  />
                </button>
                {pickerOpen && (
                  <>
                    <button
                      type="button"
                      aria-hidden
                      tabIndex={-1}
                      onClick={() => setPickerOpen(false)}
                      className="fixed inset-0 z-40 cursor-default"
                    />
                    <div
                      role="menu"
                      className="absolute right-0 top-full z-50 mt-2 max-h-72 w-64 overflow-y-auto rounded-2xl border border-hairline bg-card p-1.5 shadow-float animate-in fade-in zoom-in-95 duration-150"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          loadTemplate(null);
                          setPickerOpen(false);
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
                      >
                        <span className="flex items-center gap-1.5">
                          <Plus className="h-4 w-4 text-primary" />
                          New template
                        </span>
                        {editingId === null && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </button>
                      {allTemplates.length > 0 && (
                        <div className="my-1 border-t border-hairline" />
                      )}
                      {allTemplates.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            loadTemplate(t.id);
                            setPickerOpen(false);
                          }}
                          className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-secondary"
                        >
                          <span className="min-w-0 truncate text-foreground">
                            {t.name}
                          </span>
                          {editingId === t.id && (
                            <Check className="h-4 w-4 shrink-0 text-primary" />
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New Project Introduction"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <label className="text-sm font-semibold text-foreground">
              Message
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={pasteFromClipboard}
                className="inline-flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary/70"
              >
                <ClipboardPaste className="h-3.5 w-3.5" />
                Paste
              </button>
              <button
                type="button"
                onClick={clearBody}
                disabled={body.length === 0}
                className="inline-flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary/70 disabled:opacity-40"
              >
                <Eraser className="h-3.5 w-3.5" />
                Clear
              </button>
            </div>
          </div>
          <Textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onSelect={rememberSelection}
            onKeyUp={rememberSelection}
            onClick={rememberSelection}
            rows={6}
            placeholder={"Hi {{first_name}},\n\nI noticed you were exploring…"}
          />

          {/* Rephrase with ChatGPT — copies a tuned prompt (keeping the
              {{tokens}} intact) and opens ChatGPT; paste the reply back above. */}
          <button
            type="button"
            onClick={rephraseWithGpt}
            disabled={body.trim().length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-accent/60 py-3 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent disabled:opacity-40"
          >
            <Bot className="h-4 w-4 text-primary" />
            Rephrase with ChatGPT
          </button>
          {notice && (
            <p className="rounded-xl bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
              {notice}
            </p>
          )}

          {/* Variable toolbar */}
          <div className="rounded-2xl border border-hairline bg-secondary/40 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {hasSelection ? "Replace selection with" : "Insert field"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATE_VARIABLES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertVariable(v)}
                  className="inline-flex items-center gap-1 rounded-xl border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground"
                >
                  <Plus className="h-3 w-3" />
                  {VARIABLE_LABELS[v]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Live WhatsApp-style preview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-foreground">
              Live preview
            </label>
            {contacts.length > 0 && (
              <button
                type="button"
                onClick={() => setSampleIndex((i) => i + 1)}
                className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-foreground hover:bg-secondary/70"
              >
                <Shuffle className="h-3.5 w-3.5" />
                {sample.fullName}
              </button>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-hairline bg-[#e6ddd3] p-4">
            <div className="ml-auto max-w-[88%] rounded-2xl rounded-tr-md bg-[#dcf8c6] px-3.5 py-2.5 shadow-sm">
              <ExpandableText
                text={
                  tidyMessage(rendered.text) ||
                  "Your message preview appears here."
                }
                lines={8}
                className="text-[13px] leading-relaxed text-[#111b21]"
                toggleClassName="text-[#075e54]"
              />
              <span className="mt-1 block text-right text-[10px] text-[#667781]">
                12:30 ✓✓
              </span>
            </div>
          </div>

          {rendered.missing.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">
                Empty for this contact:
              </span>
              {rendered.missing.map((m) => (
                <Badge key={m} variant="destructive">
                  {VARIABLE_LABELS[m]}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
