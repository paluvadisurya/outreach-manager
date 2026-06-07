/**
 * Core domain types shared across features.
 *
 * The application is entirely client-side. These types describe the shape of
 * data as it lives in IndexedDB (via Dexie) and flows through the UI.
 */

/** A contact is uniquely identified by its normalized phone number. */
export interface Contact {
  /** Normalized phone number (E.164 where possible). Primary key. */
  id: string;
  /** Normalized phone for display / wa.me links (digits, no symbols). */
  phone: string;
  /** Original phone string as it first appeared, kept for reference. */
  rawPhone: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email?: string;
  company?: string;
  designation?: string;
  notes?: string;
  /** Categories this contact belongs to (a contact may have many). */
  categoryIds: string[];
  /** Lowercased concatenation of searchable fields for fast filtering. */
  searchIndex: string;
  /**
   * Soft-removed contacts (no WhatsApp / out of domain) are hidden from every
   * active list, category and campaign, and are skipped on re-import so they
   * never come back. The record is kept so the removal can be undone from
   * Settings → Removed contacts. `undefined`/`false` means active.
   */
  removed?: boolean;
  /** When the contact was soft-removed. */
  removedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Category {
  id: string;
  name: string;
  color?: string;
  createdAt: number;
}

/** The set of variables a template may reference. */
export type TemplateVariable =
  | "first_name"
  | "last_name"
  | "full_name"
  | "phone"
  | "email"
  | "company"
  | "designation";

export interface Template {
  id: string;
  name: string;
  /** Raw body containing {{variable}} tokens. */
  body: string;
  createdAt: number;
  updatedAt: number;
}

export type CampaignStatus = "active" | "paused" | "completed";

export interface Campaign {
  id: string;
  name: string;
  /**
   * Source categories the campaign draws from (a union). Empty when the campaign
   * was built from an ad-hoc contact selection.
   */
  categoryIds: string[];
  /**
   * Remembered explicit selection (selection-based campaigns) so the contact set
   * can be reconciled later via `refreshContacts`. Empty for category campaigns.
   */
  contactIds: string[];
  /** Human label for the contact source, shown in the UI. */
  sourceLabel: string;
  /** Every template attached to the campaign. */
  templateIds: string[];
  /** The default template — used for everyone unless overridden per message. */
  primaryTemplateId: string;
  status: CampaignStatus;
  /** Index of the contact currently focused in the sending queue. */
  currentIndex: number;
  total: number;
  createdAt: number;
  updatedAt: number;

  /**
   * Legacy single-source / single-template fields. Retained only so the v5 Dexie
   * upgrade and old-backup restores can backfill the new arrays. Never written by
   * new code.
   */
  categoryId?: string;
  templateId?: string;
}

export type MessageStatus =
  | "pending"
  | "sent"
  | "skipped"
  | "failed"
  | "needs_review";

/**
 * A snapshot of a rendered message for a single contact within a campaign.
 * Once generated, the rendered `message` is frozen — later template edits must
 * never alter an existing campaign.
 */
export interface CampaignMessage {
  /** `${campaignId}:${contactId}` */
  id: string;
  campaignId: string;
  contactId: string;
  /** Snapshot of contact name at generation time. */
  contactName: string;
  /** Snapshot of normalized phone at generation time. */
  phone: string;
  /** Frozen, fully-rendered message. */
  message: string;
  /** Which template rendered this message (a campaign may carry several). */
  templateId: string;
  status: MessageStatus;
  /** Stable ordering within the campaign queue. */
  order: number;
  updatedAt: number;
}

/** The outcome of a single call attempt / the current state of a call entry. */
export type CallOutcome = "pending" | "called" | "no_answer" | "skipped";

/**
 * A contact placed on the call list. There is at most one entry per contact
 * (keyed by the contact id). It tracks the latest outcome, a lightweight attempt
 * history, the campaigns linked for talking-point context, and an optional
 * scheduled next call that can be mirrored into the device calendar via .ics.
 */
export interface CallEntry {
  /** == contactId. One entry per contact. */
  id: string;
  contactId: string;
  /** Campaigns linked to this contact for talking-point context. */
  campaignIds: string[];
  outcome: CallOutcome;
  /** Number of actual call attempts (called / no_answer). */
  attempts: number;
  /** When the last outcome was logged. */
  lastOutcomeAt?: number;
  /** Scheduled next call (epoch ms), if any. */
  nextCallAt?: number;
  nextCallNote?: string;
  notes?: string;
  /** Append-only log of outcomes, newest last. */
  history: { at: number; outcome: CallOutcome }[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Which WhatsApp app a send link should target. `business` and `personal` use the
 * native URL schemes; `wa_me` uses the universal https://wa.me link (the safe
 * fallback that works everywhere).
 */
export type WhatsAppApp = "business" | "personal" | "wa_me";

/** User-configurable preferences, persisted locally. */
export interface AppSettings {
  /**
   * When a first name has multiple words, keep only the first word — unless
   * that first word is shorter than `firstNameMinLength`, in which case the
   * following word is kept too (e.g. an initial like "K Ramesh").
   */
  firstNameFirstWordOnly: boolean;
  /** Minimum length of the first word before the next word is appended. */
  firstNameMinLength: number;
  /** Preferred WhatsApp app to open send links in. Defaults to WhatsApp. */
  whatsappApp: WhatsAppApp;
  /**
   * Show the manual "Open via wa.me link instead" fallback link on the send
   * screen. Off by default — the send button already falls back to wa.me on its
   * own when a native app doesn't open. Handy to switch on for desktop/laptop.
   */
  showWaMeFallback: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  firstNameFirstWordOnly: true,
  firstNameMinLength: 3,
  whatsappApp: "personal",
  showWaMeFallback: false,
};

/**
 * A lightweight, append-only activity event. Powers the Analytics dashboard's
 * cross-day productivity views — the things that can't be reconstructed from the
 * current state alone (e.g. a true "messages sent today" count that survives a
 * campaign reset). Historical analytics is still *derived* from existing
 * timestamps; this stream only captures go-forward activity.
 */
export type AppEventType =
  | "message_sent"
  | "message_skipped"
  | "message_failed"
  | "call_logged"
  | "call_scheduled"
  | "contact_imported"
  | "contact_removed"
  | "contact_kept"
  | "campaign_created"
  | "template_created";

export interface AppEvent {
  /** Unique id (uid()). */
  id: string;
  type: AppEventType;
  /** When it happened (epoch ms). */
  at: number;
  /** Local midnight of `at` (epoch ms) — fast daily grouping/index. */
  day: number;
  /** Primary subject id — contactId / campaignId / templateId, as relevant. */
  ref?: string;
  /** Campaign this event relates to, for campaign/template filtering. */
  campaignId?: string;
  /** Template this event relates to, for template filtering. */
  templateId?: string;
  /** For `call_logged`: the recorded outcome. */
  outcome?: string;
}

/** A parsed VCF record before it is normalized into a Contact. */
export interface ParsedVCard {
  firstName: string;
  lastName: string;
  fullName: string;
  phones: string[];
  email?: string;
  company?: string;
  designation?: string;
  notes?: string;
}
