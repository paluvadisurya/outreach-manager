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
