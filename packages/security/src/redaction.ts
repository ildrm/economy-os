const SENSITIVE_KEY = /(authorization|cookie|password|secret|token|api[-_]?key|credential)/i;

export function redactSensitive(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(redactSensitive);
  if (input && typeof input === "object") {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [
        key,
        SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactSensitive(value),
      ]),
    );
  }
  return input;
}

export function isSafeRelativeRedirect(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  try {
    const decoded = decodeURIComponent(value);
    return decoded.startsWith("/") && !decoded.startsWith("//") && !decoded.includes("\\");
  } catch {
    return false;
  }
}

export const SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "cache-control": "private, no-store",
  "content-security-policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
});
