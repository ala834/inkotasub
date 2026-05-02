// Nigerian phone number utilities (client-side)
// Accepted inputs:
//   - 0XXXXXXXXXX           (11 digits, leading 0)
//   - 234XXXXXXXXXX         (13 digits)
//   - +234XXXXXXXXXX        (with plus)
//   - XXXXXXXXXX            (10 digits, no leading 0)
// Spaces, dashes, and parentheses are stripped.

export interface NormalizedPhone {
  local: string;    // 0XXXXXXXXXX  (canonical storage format)
  intl: string;     // 234XXXXXXXXXX
  intlPlus: string; // +234XXXXXXXXXX
}

export function normalizeNigerianPhone(input: string | null | undefined): NormalizedPhone | null {
  if (!input) return null;
  let p = String(input).replace(/[^\d]/g, "");
  if (!p) return null;

  if (p.startsWith("234") && p.length === 13) {
    p = "0" + p.slice(3);
  } else if (p.length === 10 && !p.startsWith("0")) {
    p = "0" + p;
  }

  if (!/^0[789]\d{9}$/.test(p)) return null;

  const intl = "234" + p.slice(1);
  return { local: p, intl, intlPlus: "+" + intl };
}

export function isValidNigerianPhone(input: string | null | undefined): boolean {
  return normalizeNigerianPhone(input) !== null;
}
