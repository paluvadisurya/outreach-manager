"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { sectionFor } from "@/lib/theme/sections";

/**
 * Retints the app per section by writing CSS variables onto <html> whenever the
 * route changes. Inline styles on the root element override the `:root` defaults
 * in `globals.css`, so the accent, focus ring, header icon bubble and the
 * ambient page wash (`body::before`, which reads `--wash-1/2` from :root) all
 * follow the active section — without touching the global WhatsApp-green
 * `--primary` and without reintroducing the iOS-breaking fixed background.
 */
export function SectionThemeController() {
  const pathname = usePathname();

  React.useLayoutEffect(() => {
    const theme = sectionFor(pathname);
    const root = document.documentElement;
    const vars: Record<string, string> = {
      "--accent": theme.accent,
      "--accent-foreground": theme.accentForeground,
      "--ring": theme.ring,
      "--section": theme.section,
      "--section-2": theme.section2,
      "--wash-1": theme.wash1,
      "--wash-2": theme.wash2,
    };
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
  }, [pathname]);

  return null;
}
