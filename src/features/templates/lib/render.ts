import type { Contact, TemplateVariable } from "@/lib/types";

/** All variables the template system understands. */
export const TEMPLATE_VARIABLES: readonly TemplateVariable[] = [
  "first_name",
  "last_name",
  "full_name",
  "phone",
  "email",
  "company",
  "designation",
] as const;

export const VARIABLE_LABELS: Record<TemplateVariable, string> = {
  first_name: "First name",
  last_name: "Last name",
  full_name: "Full name",
  phone: "Phone",
  email: "Email",
  company: "Company",
  designation: "Designation",
};

/** Matches `{{ variable }}` with optional surrounding whitespace. */
const TOKEN_RE = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

function isTemplateVariable(name: string): name is TemplateVariable {
  return (TEMPLATE_VARIABLES as readonly string[]).includes(name);
}

/** Resolve a single variable against a contact source. */
function resolve(
  variable: TemplateVariable,
  contact: Partial<Contact>,
): string {
  switch (variable) {
    case "first_name":
      return contact.firstName ?? "";
    case "last_name":
      return contact.lastName ?? "";
    case "full_name":
      return contact.fullName ?? "";
    case "phone":
      return contact.phone ?? "";
    case "email":
      return contact.email ?? "";
    case "company":
      return contact.company ?? "";
    case "designation":
      return contact.designation ?? "";
    default:
      return "";
  }
}

/** Return the list of valid, distinct variables referenced in a template body. */
export function extractVariables(body: string): TemplateVariable[] {
  const found = new Set<TemplateVariable>();
  for (const match of body.matchAll(TOKEN_RE)) {
    const name = match[1];
    if (name && isTemplateVariable(name)) found.add(name);
  }
  return [...found];
}

export interface RenderResult {
  /** The fully rendered message. */
  text: string;
  /** Variables referenced by the template but empty for this contact. */
  missing: TemplateVariable[];
}

/**
 * Render a template body for a contact. Known tokens are substituted; tokens
 * that reference a variable with no value are replaced with an empty string and
 * reported in `missing` so the UI can flag the message for review. Unknown
 * tokens (typos) are left untouched so the author notices them.
 */
export function renderTemplate(
  body: string,
  contact: Partial<Contact>,
): RenderResult {
  const missing = new Set<TemplateVariable>();

  const text = body.replace(TOKEN_RE, (whole, rawName: string) => {
    if (!isTemplateVariable(rawName)) return whole;
    const value = resolve(rawName, contact);
    if (!value) missing.add(rawName);
    return value;
  });

  return { text, missing: [...missing] };
}

/** Tidy up whitespace left behind when optional variables render empty. */
export function tidyMessage(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Build a ready-to-paste ChatGPT prompt that rephrases a WhatsApp outreach
 * message while leaving every `{{variable}}` token untouched. Tuned for a
 * real-estate sales professional in India messaging channel partners, direct
 * customers and business professionals: simple Indian English, warm and
 * relationship-building, medium length, no emojis, no em dashes, and not
 * "AI-ish". The reply is requested in a markdown code block so the user can copy
 * it cleanly back into the template box.
 */
export function buildRephrasePrompt(body: string): string {
  return [
    "Rephrase the WhatsApp message below. It is a friendly business outreach from a real-estate sales professional in India. The reader is usually a channel partner, a direct customer, or a business professional who is interested in real estate.",
    "",
    "First understand what the sender is really trying to say from the rough input. Then rewrite it so it reads clean, confident and ready to send.",
    "",
    "Follow these rules exactly:",
    "- Keep every placeholder token EXACTLY as written, including the double curly braces, for example {{first_name}}, {{company}}, {{designation}}. Never translate, rename, remove, or reword them, and keep them in a natural place in the sentence.",
    "- Keep the original meaning and intent. Do not invent new offers, facts, numbers, or claims.",
    "- Understand the intent behind the message and gently amplify it to build a warmer relationship, the way a real person in India would in everyday life. Stay genuine, never pushy or salesy.",
    "- Keep the length balanced. Not too long and not too short. A few clear lines that get the point across quickly.",
    "- Tone: warm, polite and business-professional, yet relaxed and human, like a real person texting, not a bot.",
    "- Use simple, clear Indian English with short sentences that are easy to read on a phone.",
    "- Do NOT use any emojis.",
    "- Do NOT use em dashes (the long dash). Use a comma, a full stop, or split into a new sentence instead.",
    "- Avoid AI-ish, robotic, or heavy marketing language and buzzwords. Keep it natural and effective.",
    "- Format it cleanly for WhatsApp with short paragraphs and natural line breaks.",
    "- Return ONLY the rephrased message inside a single markdown code block, with nothing before or after it, so I can copy it directly.",
    "",
    "Message to rephrase:",
    body.trim(),
  ].join("\n");
}

/**
 * Strip a single surrounding markdown code fence (``` or ```lang … ```) from a
 * pasted block. ChatGPT wraps its rephrased reply in a fence; this lets the user
 * paste the whole thing back without the backticks leaking into the template.
 */
export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
  return fenced ? fenced[1]!.trim() : trimmed;
}
