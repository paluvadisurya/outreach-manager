import type { WhatsAppApp } from "@/lib/types";

/**
 * Build a WhatsApp deep link with a prefilled message. The application never sends
 * automatically — this link opens WhatsApp with the message ready, and the user
 * presses send manually. That is intentional.
 *
 * `app` selects the target:
 * - `business` → `whatsapp-business://send?...` (WhatsApp Business native scheme)
 * - `personal` → `whatsapp://send?...` (WhatsApp native scheme)
 * - `wa_me`    → `https://wa.me/...` (universal link; the safe default that works
 *   everywhere, and the in-app fallback when a native scheme isn't registered).
 *
 * The native schemes are not officially documented by Meta for Business, so the UI
 * always offers the `wa_me` link as a fallback.
 */
export function buildWaLink(
  phone: string,
  message: string,
  app: WhatsAppApp = "wa_me",
): string {
  const digits = phone.replace(/\D/g, "");
  const text = encodeURIComponent(message);
  switch (app) {
    case "business":
      return `whatsapp-business://send?phone=${digits}&text=${text}`;
    case "personal":
      return `whatsapp://send?phone=${digits}&text=${text}`;
    case "wa_me":
    default:
      return `https://wa.me/${digits}?text=${text}`;
  }
}
