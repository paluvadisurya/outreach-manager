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

/**
 * Open WhatsApp with the message prefilled, reliably.
 *
 * Native schemes (`whatsapp://`, `whatsapp-business://`) can fail silently from a
 * browser or installed PWA — especially WhatsApp Business, which has no dependable
 * public scheme on iOS. So for native targets we trigger the scheme via a
 * top-level navigation (more reliable than `target="_blank"` in standalone PWAs)
 * and arm a short watchdog: if the page is still visible after ~1.3s, the app
 * didn't take over, so we fall back to the universal `https://wa.me/` link, which
 * always works and lets the OS route to whichever WhatsApp is installed
 * (including Business). When the app *does* launch, the page is backgrounded and
 * we cancel the fallback.
 *
 * The `wa_me` preference (best for desktop/laptop) opens the universal link
 * directly with no native attempt.
 */
export function openWhatsApp(
  phone: string,
  message: string,
  app: WhatsAppApp = "personal",
): void {
  if (typeof window === "undefined") return;

  const waMe = buildWaLink(phone, message, "wa_me");
  if (app === "wa_me") {
    window.open(waMe, "_blank", "noopener,noreferrer");
    return;
  }

  const native = buildWaLink(phone, message, app);
  let settled = false;
  let timer = 0;

  // Function declarations are hoisted, so the mutual references below are fine
  // regardless of order.
  function cleanup() {
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onLeave);
    window.removeEventListener("blur", onLeave);
  }
  function settle(launched: boolean) {
    if (settled) return;
    settled = true;
    cleanup();
    if (!launched && document.visibilityState === "visible") {
      // App never took over → use the link that always works.
      window.location.href = waMe;
    }
  }
  function onVisibility() {
    if (document.visibilityState === "hidden") settle(true);
  }
  function onLeave() {
    settle(true);
  }

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onLeave);
  window.addEventListener("blur", onLeave);
  timer = window.setTimeout(() => settle(false), 1300);

  // Fire the native scheme.
  window.location.href = native;
}
