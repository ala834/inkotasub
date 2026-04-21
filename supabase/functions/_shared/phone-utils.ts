// Shared phone number utilities for Nigerian numbers.
// Accepts: 080..., 23480..., +23480..., 80...
// Returns normalized formats or null if invalid.

export interface NormalizedPhone {
  local: string;       // 0XXXXXXXXXX (11 digits, leading 0)
  intl: string;        // 234XXXXXXXXXX (13 digits)
  intlPlus: string;    // +234XXXXXXXXXX
  prefix4: string;     // first 4 digits of local form (e.g. 0803)
}

export function normalizePhone(input: string | null | undefined): NormalizedPhone | null {
  if (!input) return null;
  let p = String(input).replace(/[^\d]/g, "");
  if (!p) return null;

  if (p.startsWith("234") && p.length === 13) {
    p = "0" + p.slice(3);
  } else if (p.length === 10 && !p.startsWith("0")) {
    p = "0" + p;
  }

  if (!/^0\d{10}$/.test(p)) return null;

  const intl = "234" + p.slice(1);
  return {
    local: p,
    intl,
    intlPlus: "+" + intl,
    prefix4: p.slice(0, 4),
  };
}

// Detect Nigerian network from a phone prefix. Returns lowercase network or null.
const NETWORK_PREFIXES: Record<string, string[]> = {
  mtn: ["0803","0806","0703","0706","0813","0816","0810","0814","0903","0906","0913","0916","0704"],
  airtel: ["0802","0808","0708","0812","0701","0902","0901","0907","0912"],
  glo: ["0805","0807","0705","0815","0811","0905","0915"],
  "9mobile": ["0809","0818","0817","0909","0908"],
};

export function detectNetwork(phoneOrPrefix: string): string | null {
  const norm = normalizePhone(phoneOrPrefix);
  const p4 = norm?.prefix4 || phoneOrPrefix.slice(0, 4);
  for (const [net, list] of Object.entries(NETWORK_PREFIXES)) {
    if (list.includes(p4)) return net;
  }
  return null;
}
