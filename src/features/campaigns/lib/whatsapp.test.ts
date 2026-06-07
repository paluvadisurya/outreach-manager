import { describe, it, expect, vi, afterEach } from "vitest";
import { buildWaLink, openWhatsApp } from "./whatsapp";

describe("buildWaLink", () => {
  it("strips non-digits from the phone and encodes the message", () => {
    const link = buildWaLink("+91 98765 43210", "Hi Ramesh, how are you?");
    expect(link).toBe(
      "https://wa.me/919876543210?text=Hi%20Ramesh%2C%20how%20are%20you%3F",
    );
  });

  it("encodes newlines in the message", () => {
    const link = buildWaLink("919876543210", "Line 1\nLine 2");
    expect(link).toContain("text=Line%201%0ALine%202");
  });

  it("builds a WhatsApp Business scheme link", () => {
    const link = buildWaLink("+91 98765 43210", "Hello", "business");
    expect(link).toBe("whatsapp-business://send?phone=919876543210&text=Hello");
  });

  it("builds a personal WhatsApp scheme link", () => {
    const link = buildWaLink("+91 98765 43210", "Hello", "personal");
    expect(link).toBe("whatsapp://send?phone=919876543210&text=Hello");
  });

  it("falls back to wa.me for the wa_me option", () => {
    const link = buildWaLink("919876543210", "Hello", "wa_me");
    expect(link).toBe("https://wa.me/919876543210?text=Hello");
  });
});

describe("openWhatsApp", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the universal wa.me link directly for the wa_me preference", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    openWhatsApp("+91 98765 43210", "Hello", "wa_me");
    expect(open).toHaveBeenCalledWith(
      "https://wa.me/919876543210?text=Hello",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("arms a fallback watchdog for native schemes", () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    const addListener = vi.spyOn(document, "addEventListener");
    // Navigation via location.href isn't implemented in jsdom; suppress the noise.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      openWhatsApp("+91 98765 43210", "Hello", "business");
      // It schedules a fallback and listens for the app taking focus.
      expect(setTimeoutSpy).toHaveBeenCalled();
      expect(addListener).toHaveBeenCalledWith(
        "visibilitychange",
        expect.any(Function),
      );
    } finally {
      vi.useRealTimers();
      errSpy.mockRestore();
    }
  });
});
