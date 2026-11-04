import { createHash, createHmac, randomInt } from "node:crypto";

// Crockford base32 without I, L, O, U — easy to read aloud and type.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Public, non-sequential reference such as "RC-7K2M-9QXD" (~10^12 combinations). */
export function generateReference() {
  let chars = "";
  for (let i = 0; i < 8; i++) chars += ALPHABET[randomInt(ALPHABET.length)];
  return `RC-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/** Stable SHA-256 of a JSON-serializable value (object keys sorted). */
export function hashPayload(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

/** Keyed hash so rate-limit buckets never store raw IPs or emails. */
export function hashBucket(secret: string, value: string) {
  return createHmac("sha256", secret).update(value).digest("hex").slice(0, 40);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}
