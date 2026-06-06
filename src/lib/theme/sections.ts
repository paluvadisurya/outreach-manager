import {
  Users,
  Tags,
  LayoutTemplate,
  Send,
  Phone,
  CalendarDays,
  Settings,
  type LucideIcon,
} from "lucide-react";

/**
 * Per-section visual identity.
 *
 * Each top-level section gets its own pastel accent and ambient page wash so the
 * app feels distinct as you move between tabs, while the header *structure* stays
 * identical everywhere (no layout shift). Only color tokens change.
 *
 * Values are HSL component strings (e.g. "158 55% 94%") so they can be dropped
 * straight into the `hsl(var(--token))` variables defined in `globals.css`.
 * `--primary` (WhatsApp green) is intentionally NOT themed — it stays global.
 */
export interface SectionTheme {
  key: string;
  name: string;
  icon: LucideIcon;
  /** Light pastel background for selected/active states (`--accent`). */
  accent: string;
  /** Readable foreground on `accent` (`--accent-foreground`). */
  accentForeground: string;
  /** Focus ring (`--ring`). */
  ring: string;
  /** Strong mid tone used for the header icon bubble gradient (`--section`). */
  section: string;
  /** Gradient end for the icon bubble (`--section-2`). */
  section2: string;
  /** Ambient wash radial colors (`--wash-1` / `--wash-2`). */
  wash1: string;
  wash2: string;
}

export const SECTIONS: Record<string, SectionTheme> = {
  people: {
    key: "people",
    name: "People",
    icon: Users,
    accent: "158 55% 94%",
    accentForeground: "160 60% 26%",
    ring: "158 64% 42%",
    section: "158 64% 40%",
    section2: "168 70% 45%",
    wash1: "250 90% 97%",
    wash2: "165 70% 96%",
  },
  contacts: {
    key: "contacts",
    name: "Contacts",
    icon: Users,
    accent: "158 55% 94%",
    accentForeground: "160 60% 26%",
    ring: "158 64% 42%",
    section: "158 64% 40%",
    section2: "168 70% 45%",
    wash1: "250 90% 97%",
    wash2: "165 70% 96%",
  },
  categories: {
    key: "categories",
    name: "Categories",
    icon: Tags,
    accent: "265 70% 95%",
    accentForeground: "265 48% 38%",
    ring: "265 70% 60%",
    section: "265 68% 60%",
    section2: "285 70% 64%",
    wash1: "265 90% 97%",
    wash2: "290 80% 97%",
  },
  templates: {
    key: "templates",
    name: "Templates",
    icon: LayoutTemplate,
    accent: "38 90% 91%",
    accentForeground: "28 72% 32%",
    ring: "38 92% 50%",
    section: "35 92% 52%",
    section2: "22 90% 56%",
    wash1: "45 95% 96%",
    wash2: "28 92% 96%",
  },
  campaigns: {
    key: "campaigns",
    name: "Campaigns",
    icon: Send,
    accent: "205 85% 93%",
    accentForeground: "210 68% 32%",
    ring: "205 90% 55%",
    section: "205 85% 52%",
    section2: "222 85% 58%",
    wash1: "205 95% 97%",
    wash2: "225 90% 97%",
  },
  call: {
    key: "call",
    name: "Call",
    icon: Phone,
    accent: "350 85% 94%",
    accentForeground: "345 60% 40%",
    ring: "350 85% 60%",
    section: "350 78% 58%",
    section2: "12 85% 60%",
    wash1: "350 95% 97%",
    wash2: "14 90% 97%",
  },
  calendar: {
    key: "calendar",
    name: "Calendar",
    icon: CalendarDays,
    accent: "190 70% 92%",
    accentForeground: "192 60% 28%",
    ring: "190 80% 45%",
    section: "190 78% 44%",
    section2: "200 80% 50%",
    wash1: "190 90% 97%",
    wash2: "205 85% 97%",
  },
  settings: {
    key: "settings",
    name: "Settings",
    icon: Settings,
    accent: "220 30% 93%",
    accentForeground: "222 30% 30%",
    ring: "222 30% 50%",
    section: "222 22% 48%",
    section2: "230 24% 56%",
    wash1: "230 60% 97%",
    wash2: "210 50% 97%",
  },
};

export const DEFAULT_SECTION = SECTIONS.contacts!;

/** Resolve the section theme for a pathname (prefix match). */
export function sectionFor(pathname: string): SectionTheme {
  for (const theme of Object.values(SECTIONS)) {
    if (pathname === `/${theme.key}` || pathname.startsWith(`/${theme.key}/`)) {
      return theme;
    }
  }
  return DEFAULT_SECTION;
}
