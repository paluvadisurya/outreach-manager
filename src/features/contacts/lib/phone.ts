import {
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

/**
 * Default region used when a number has no country code. The product is aimed
 * at the Indian real-estate market, where most numbers are local 10-digit
 * mobiles, so we assume India unless an explicit country code is present.
 */
export const DEFAULT_REGION: CountryCode = "IN";

/** India's calling code and the length of a national mobile number. */
const IN_CC = "91";
const IN_NSN_LENGTH = 10;

export interface NormalizedPhone {
  /** E.164 form, e.g. "+919876543210". Used as the contact identifier. */
  id: string;
  /** Digits only, no "+", suitable for wa.me links, e.g. "919876543210". */
  waNumber: string;
  /** Human-friendly international form, e.g. "+91 98765 43210". */
  display: string;
}

function build(e164: string): NormalizedPhone {
  const parsed = parsePhoneNumberFromString(e164);
  return {
    id: e164,
    waNumber: e164.replace(/\D/g, ""),
    display: parsed?.isValid() ? parsed.formatInternational() : e164,
  };
}

/**
 * Reduce a digit string to a canonical Indian E.164 number, or return null if
 * it cannot be interpreted as one. Crucially this is idempotent with respect to
 * the country code: numbers that already carry `91` (or several, from repeated
 * bad imports) are not prefixed again.
 *
 *   "9876543210"        -> +919876543210
 *   "919876543210"      -> +919876543210   (already has 91)
 *   "09876543210"       -> +919876543210   (trunk 0 stripped)
 *   "9191919676887489"  -> +919676887489   (repeated 91 collapsed)
 */
function indianFromDigits(digitsIn: string): NormalizedPhone | null {
  let digits = digitsIn.replace(/^0+/, ""); // drop national trunk zeros

  // Collapse any number of leading country codes until a 10-digit national
  // number remains. The guard `> IN_NSN_LENGTH` protects genuine 10-digit
  // mobiles that happen to start with "91".
  while (digits.length > IN_NSN_LENGTH && digits.startsWith(IN_CC)) {
    digits = digits.slice(IN_CC.length);
  }

  if (digits.length === IN_NSN_LENGTH && /^[6-9]/.test(digits)) {
    return build(`+${IN_CC}${digits}`);
  }
  return null;
}

/**
 * Normalize a raw phone string into a canonical identifier.
 *
 * All of these resolve to the same identifier:
 *   "+91 9876543210", "9876543210", "91-9876543210", "+91-98765-43210"
 *
 * Returns `null` when the input cannot be interpreted as a valid phone number,
 * which signals that the record must be skipped during import.
 */
export function normalizePhone(
  raw: string | null | undefined,
  region: CountryCode = DEFAULT_REGION,
): NormalizedPhone | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // An explicit "+" means the caller stated the country code — trust
  // libphonenumber to interpret it correctly across regions.
  if (trimmed.startsWith("+")) {
    const parsed = parsePhoneNumberFromString(trimmed, region);
    if (parsed && parsed.isValid()) return build(parsed.number);
  }

  // India-first interpretation of the bare digits (handles existing 91/0).
  const digits = trimmed.replace(/\D/g, "");
  if (region === DEFAULT_REGION) {
    const indian = indianFromDigits(digits);
    if (indian) return indian;
  }

  // Fall back to libphonenumber for the configured region (non-India, etc.).
  const parsed = parsePhoneNumberFromString(trimmed, region);
  if (parsed && parsed.isValid()) return build(parsed.number);

  // Last resort: keep a plausible run of digits as a raw international number.
  if (digits.length >= 7 && digits.length <= 15) {
    return build(`+${digits}`);
  }
  return null;
}

/** Convenience helper: is this raw value a usable phone number? */
export function isValidPhone(
  raw: string | null | undefined,
  region: CountryCode = DEFAULT_REGION,
): boolean {
  return normalizePhone(raw, region) !== null;
}
