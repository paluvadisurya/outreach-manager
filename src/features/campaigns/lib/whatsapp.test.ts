import { describe, it, expect } from "vitest";
import { buildWaLink } from "./whatsapp";

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
});
