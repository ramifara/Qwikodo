/** What the decoded text actually is, when it announces itself. */
export function payloadKind(text: string): string | null {
  const t = text.trim();
  if (/^https?:\/\//i.test(t)) return "Link";
  if (/^wifi:/i.test(t)) return "Wi-Fi network";
  if (/^(begin:vcard|mecard:)/i.test(t)) return "Contact";
  if (/^begin:vevent/i.test(t)) return "Calendar event";
  if (/^mailto:/i.test(t)) return "Email";
  if (/^(tel|sms|smsto):/i.test(t)) return "Phone";
  if (/^geo:/i.test(t)) return "Location";
  if (/^otpauth:/i.test(t)) return "One-time password";
  if (/^bitcoin:|^ethereum:/i.test(t)) return "Payment";
  return null;
}

export function isOpenable(text: string): boolean {
  return /^(https?|mailto|tel):/i.test(text.trim());
}

export interface WifiInfo {
  ssid: string;
  password?: string;
}

/**
 * Parses a `WIFI:` payload's `S:`/`P:` fields, unescaping the backslash
 * escapes the format uses for `;`, `:`, `,`, and `\` inside a value.
 */
export function parseWifi(text: string): WifiInfo | null {
  const trimmed = text.trim();
  if (!/^wifi:/i.test(trimmed)) return null;
  const body = trimmed.slice("wifi:".length);
  const fields: Record<string, string> = {};
  let key = "";
  let value = "";
  let inValue = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "\\" && i + 1 < body.length) {
      value += body[++i];
      continue;
    }
    if (!inValue && c === ":") {
      inValue = true;
      continue;
    }
    if (c === ";") {
      if (key) fields[key] = value;
      key = "";
      value = "";
      inValue = false;
      continue;
    }
    if (inValue) value += c;
    else key += c;
  }
  return fields.S ? { ssid: fields.S, password: fields.P || undefined } : null;
}

export function relativeTime(timestamp: number, now: number): string {
  const s = Math.max(0, Math.round((now - timestamp) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 7 ? `${d}d ago` : new Date(timestamp).toLocaleDateString();
}

/**
 * A bar pattern derived from the decoded text. It isn't a real symbology and
 * doesn't claim to be — it's a stable visual fingerprint, so the same code
 * always draws the same bars and a different code always draws different ones.
 */
export function fingerprint(seed: string, segments = 96): number[] {
  if (!seed) return Array.from({ length: segments }, () => 1);
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  let state = hash || 1;
  return Array.from({ length: segments }, () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return (state % 4) + 1;
  });
}
