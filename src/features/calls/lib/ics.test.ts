import { describe, expect, it } from "vitest";
import { buildICS, icsFilename } from "./ics";

/** Pull the value of a single (unfolded) property line out of an ICS string. */
function prop(ics: string, name: string): string | undefined {
  const unfolded = ics.replace(/\r\n[ \t]/g, "");
  const line = unfolded
    .split("\r\n")
    .find((l) => l.startsWith(`${name}:`));
  return line?.slice(name.length + 1);
}

describe("buildICS", () => {
  const start = new Date(Date.UTC(2026, 5, 7, 10, 30, 0)); // 2026-06-07 10:30 UTC

  it("wraps a single VEVENT in a VCALENDAR", () => {
    const ics = buildICS({ title: "Call Ramesh", start });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR")).toBe(true);
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1);
    expect((ics.match(/END:VEVENT/g) ?? []).length).toBe(1);
  });

  it("emits DTSTART/DTEND in UTC basic format with the right duration", () => {
    const ics = buildICS({ title: "Call", start, durationMin: 30 });
    expect(prop(ics, "DTSTART")).toBe("20260607T103000Z");
    // +30 minutes
    expect(prop(ics, "DTEND")).toBe("20260607T110000Z");
  });

  it("defaults to a 15-minute event", () => {
    const ics = buildICS({ title: "Call", start });
    expect(prop(ics, "DTEND")).toBe("20260607T104500Z");
  });

  it("uses CRLF line endings", () => {
    const ics = buildICS({ title: "Call", start });
    expect(ics.includes("\r\n")).toBe(true);
    expect(ics.includes("\n\n")).toBe(false);
  });

  it("escapes special characters in TEXT values", () => {
    const ics = buildICS({
      title: "Call A, B; C",
      start,
      description: "line1\nline2",
    });
    expect(prop(ics, "SUMMARY")).toBe("Call A\\, B\\; C");
    expect(prop(ics, "DESCRIPTION")).toBe("line1\\nline2");
  });

  it("includes a stable UID and a reminder alarm", () => {
    const ics = buildICS({ title: "Call", start, uid: "abc@test" });
    expect(prop(ics, "UID")).toBe("abc@test");
    expect(ics.includes("BEGIN:VALARM")).toBe(true);
    expect(ics.includes("TRIGGER:-PT5M")).toBe(true);
  });

  it("omits optional event properties when not provided", () => {
    const ics = buildICS({ title: "Call", start });
    // Scope to the VEVENT body before the alarm (which carries its own
    // DESCRIPTION:Reminder).
    const eventBody = ics.slice(0, ics.indexOf("BEGIN:VALARM"));
    expect(eventBody.includes("\r\nDESCRIPTION:")).toBe(false);
    expect(eventBody.includes("\r\nLOCATION:")).toBe(false);
  });
});

describe("icsFilename", () => {
  it("slugifies the title", () => {
    expect(icsFilename({ title: "Call Ramesh Kumar!", start: new Date() })).toBe(
      "call-ramesh-kumar.ics",
    );
  });

  it("falls back when the title has no usable characters", () => {
    expect(icsFilename({ title: "!!!", start: new Date() })).toBe("call.ics");
  });
});
