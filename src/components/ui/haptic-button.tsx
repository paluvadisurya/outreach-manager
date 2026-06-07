"use client";

import * as React from "react";
import { type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

/**
 * A button that plays a REAL native haptic on a direct finger tap — including
 * iOS 26.5+, where script-triggered haptics no longer fire.
 *
 * The trick (see project-fathom): WebKit's native switch control
 * (`<input type="checkbox" switch>`, iOS 18+) plays the system tick when the
 * user toggles it. So we lay a real, invisible switch over the whole button and
 * let the finger tap the switch directly — iOS plays the tick, and `onClick`
 * runs the action. The visible pill is just decoration (pointer-events: none);
 * the thing you actually tap is the switch.
 *
 * Constraints honoured:
 *  - The switch fills the button (`inset-0`, `h-full w-full`) and we clip with
 *    `overflow-hidden` so the rectangular hit box doesn't leak past a rounded
 *    button's corners.
 *  - We hide it with `opacity-0` only — NOT `appearance-none` — because stripping
 *    the control's native look disables the haptic.
 *  - Android (which has no switch haptic) falls back to `navigator.vibrate`.
 *
 * Use this for primary/destructive actions. For navigations (`<a href>`),
 * keep the plain `haptic()` helper.
 */

export type HapticKind = "light" | "medium" | "success" | "warning";

const VIBRATE_PATTERNS: Record<HapticKind, number | number[]> = {
  light: 10,
  medium: 18,
  success: [14, 40, 24],
  warning: [22, 60, 22],
};

function androidVibrate(kind: HapticKind): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & {
    vibrate?: (pattern: number | number[]) => boolean;
  };
  try {
    nav.vibrate?.(VIBRATE_PATTERNS[kind]);
  } catch {
    /* ignore */
  }
}

export interface HapticButtonProps
  extends Omit<
      React.HTMLAttributes<HTMLSpanElement>,
      "onClick" | "onChange"
    >,
    VariantProps<typeof buttonVariants> {
  /** Fired on tap (after the haptic). */
  onClick?: () => void;
  /** Haptic intensity for the Android vibrate fallback. */
  haptic?: HapticKind;
  disabled?: boolean;
  /** Accessible label for the underlying control. */
  "aria-label"?: string;
  type?: "button";
}

export const HapticButton = React.forwardRef<HTMLSpanElement, HapticButtonProps>(
  (
    {
      className,
      variant,
      size,
      onClick,
      haptic = "light",
      disabled = false,
      children,
      "aria-label": ariaLabel,
      ...rest
    },
    ref,
  ) => {
    const handle = () => {
      if (disabled) return;
      androidVibrate(haptic);
      onClick?.();
    };

    return (
      <span
        ref={ref}
        className={cn(
          buttonVariants({ variant, size }),
          "relative isolate overflow-hidden",
          disabled && "pointer-events-none opacity-50",
          className,
        )}
        {...rest}
      >
        {/* Visible content sits in normal flow so layout classes (e.g. flex-col)
            on this element lay it out exactly like a normal Button. */}
        {children}
        {/* The real tap target: a native switch filling the button, laid over the
            content. Tapping it directly is what makes iOS play the system haptic.
            Absolutely positioned so it never disturbs the content layout. */}
        <label className="absolute inset-0 z-10 m-0 cursor-pointer">
          <input
            type="checkbox"
            tabIndex={-1}
            aria-label={ariaLabel}
            disabled={disabled}
            onChange={handle}
            className="absolute inset-0 h-full w-full opacity-0"
            // `switch` is a non-standard WebKit attribute not in the React types.
            {...({ switch: "" } as Record<string, string>)}
          />
        </label>
      </span>
    );
  },
);
HapticButton.displayName = "HapticButton";
