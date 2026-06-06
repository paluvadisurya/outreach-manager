/**
 * Minimal iCalendar (.ics) generation for call reminders.
 *
 * The app never syncs with a calendar server; instead it hands the user a single
 * VEVENT file. On iOS, opening a `text/calendar` download prompts "open in
 * Calendar", which shows the native add-event sheet with all details pre-filled,
 * letting the user pick a calendar and confirm — no permissions, no URL schemes.
 */

export interface CalendarEvent {
  title: string;
  start: Date;
  /** Event length in minutes (default 15). */
  durationMin?: number;
  description?: string;
  location?: string;
  /** Stable identifier; one is generated if omitted. */
  uid?: string;
}

/** RFC 5545 UTC timestamp, e.g. 20260607T103000Z. */
function formatUTC(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** Escape a TEXT value per RFC 5545 §3.3.11 (backslash, comma, semicolon, NL). */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold a content line to 75 octets max, continuation lines starting with a
 * single space, joined with CRLF (RFC 5545 §3.1). We fold on character count,
 * which is correct for the ASCII content we emit here.
 */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let remaining = line;
  parts.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);
  while (remaining.length > 74) {
    parts.push(" " + remaining.slice(0, 74));
    remaining = remaining.slice(74);
  }
  if (remaining.length) parts.push(" " + remaining);
  return parts.join("\r\n");
}

/** Build a complete VCALENDAR document containing a single VEVENT. */
export function buildICS(event: CalendarEvent): string {
  const durationMin = event.durationMin ?? 15;
  const end = new Date(event.start.getTime() + durationMin * 60_000);
  const uid =
    event.uid ??
    `${event.start.getTime()}-${Math.random().toString(36).slice(2)}@outreach-manager`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Outreach Manager//Call Reminder//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatUTC(new Date())}`,
    `DTSTART:${formatUTC(event.start)}`,
    `DTEND:${formatUTC(end)}`,
    `SUMMARY:${escapeText(event.title)}`,
  ];
  if (event.description) {
    lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  }
  if (event.location) {
    lines.push(`LOCATION:${escapeText(event.location)}`);
  }
  // A 5-minute popup reminder so the manual schedule actually nudges the user.
  lines.push(
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder",
    "TRIGGER:-PT5M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  );

  return lines.map(fold).join("\r\n");
}

/** A filesystem-safe .ics filename derived from the event title. */
export function icsFilename(event: CalendarEvent): string {
  const slug = event.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${slug || "call"}.ics`;
}

/**
 * Trigger a download of the event as an .ics file. Mirrors the download approach
 * used for backups (`downloadBackup` in `lib/backup/backup.ts`).
 */
export function downloadICS(event: CalendarEvent): void {
  const ics = buildICS(event);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = icsFilename(event);
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
