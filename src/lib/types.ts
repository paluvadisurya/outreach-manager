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
  /** Source category, or empty when built from an ad-hoc contact selection. */
  categoryId: string;
  /** Human label for the contact source, shown in the UI. */
  sourceLabel: string;
  templateId: string;
  status: CampaignStatus;
  /** Index of the contact currently focused in the sending queue. */
  currentIndex: number;
  total: number;
  createdAt: number;
  updatedAt: number;
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
  status: MessageStatus;
  /** Stable ordering within the campaign queue. */
  order: number;
  updatedAt: number;
}

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
}

export const DEFAULT_SETTINGS: AppSettings = {
  firstNameFirstWordOnly: true,
  firstNameMinLength: 2,
};

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
