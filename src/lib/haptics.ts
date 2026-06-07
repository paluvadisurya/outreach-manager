/**
 * Lightweight tactile feedback for primary actions (Mark Sent, call outcomes,
 * WhatsApp open, destructive confirms, …).
 *
 * Two delivery paths, because the web has no single cross-platform haptic API:
 *  - Android / Chrome support `navigator.vibrate(pattern)`.
 *  - iOS Safari does **not** support `navigator.vibrate`. The reliable trick is a
 *    hidden, native `<input type="checkbox" switch>` inside a `<label>`: toggling
 *    it (programmatically, within a user gesture) makes iOS play its switch
 *    haptic. This works on iOS 17.4+ and is a no-op elsewhere.
 *
 * `haptic()` MUST be called synchronously inside the click/tap handler — iOS only
 * plays the feedback when it's tied to a genuine user gesture.
 */

export type HapticKind = "light" | "medium" | "success" | "warning";

const VIBRATE_PATTERNS: Record<HapticKind, number | number[]> = {
  light: 10,
  medium: 18,
  success: [14, 40, 24],
  warning: [22, 60, 22],
};

/** Lazily-created, visually-hidden iOS switch used to elicit the OS haptic. */
let iosSwitch: HTMLLabelElement | null = null;

function getIosSwitch(): HTMLLabelElement | null {
  if (typeof document === "undefined") return null;
  if (iosSwitch && document.body.contains(iosSwitch)) return iosSwitch;

  const label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  // Keep it in the layout/render tree (display:none would suppress the haptic)
  // but invisible and non-interactive to the user.
  Object.assign(label.style, {
    position: "fixed",
    bottom: "0",
    left: "0",
    width: "1px",
    height: "1px",
    opacity: "0",
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: "-1",
  } satisfies Partial<CSSStyleDeclaration>);

  const input = document.createElement("input");
  input.type = "checkbox";
  // The `switch` attribute is what turns this into a native iOS toggle.
  input.setAttribute("switch", "");
  input.tabIndex = -1;
  label.appendChild(input);
  document.body.appendChild(label);
  iosSwitch = label;
  return label;
}

function fireIosSwitchHaptic(): void {
  // Toggling the native switch makes iOS play its selection haptic. We don't
  // care about the resulting checked state.
  getIosSwitch()?.click();
}

/** Trigger tactile feedback for the given action intensity. No-op when unsupported. */
export function haptic(kind: HapticKind = "light"): void {
  if (typeof window === "undefined") return;

  const nav = window.navigator as Navigator & {
    vibrate?: (pattern: number | number[]) => boolean;
  };

  if (typeof nav.vibrate === "function") {
    try {
      if (nav.vibrate(VIBRATE_PATTERNS[kind])) return;
    } catch {
      /* fall through to the iOS path */
    }
  }

  fireIosSwitchHaptic();
}
