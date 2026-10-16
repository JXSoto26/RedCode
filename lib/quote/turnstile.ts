import "server-only";

/**
 * Server-side verification of Cloudflare Turnstile tokens (siteverify).
 * Fails closed: a missing, invalid, expired or unverifiable token means the
 * request is not saved and no email is sent.
 */

export const TURNSTILE_ACTION = "quote_request";
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 8_000;

export type TurnstileFailure = "missing" | "invalid" | "expired" | "mismatch" | "unavailable";
export type TurnstileResult = { ok: true } | { ok: false; reason: TurnstileFailure };

export interface TurnstileVerifier {
  verify(token: string | undefined, ip: string | null, idempotencyKey: string): Promise<TurnstileResult>;
}

type SiteverifyResponse = {
  success?: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
};

export type TurnstileChecks = {
  /** Lowercased hostnames the token must come from; null skips the check. */
  expectedHostnames: string[] | null;
  /** Require action === TURNSTILE_ACTION. Only Cloudflare test keys skip it. */
  checkAction: boolean;
};

export function createTurnstileVerifier(
  secretKey: string,
  checks: TurnstileChecks,
  fetchImpl: typeof fetch = fetch
): TurnstileVerifier {
  return {
    async verify(token, ip, idempotencyKey) {
      if (!token || token.length > 2048) return { ok: false, reason: "missing" };

      let body: SiteverifyResponse;
      try {
        const response = await fetchImpl(SITEVERIFY, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            secret: secretKey,
            response: token,
            ...(ip && { remoteip: ip }),
            // Lets a repeated verification of the same token (e.g. a retried
            // request) get the same answer instead of "already spent".
            idempotency_key: idempotencyKey,
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!response.ok) return { ok: false, reason: "unavailable" };
        body = (await response.json()) as SiteverifyResponse;
      } catch {
        return { ok: false, reason: "unavailable" };
      }

      if (body.success !== true) {
        const codes = body["error-codes"] ?? [];
        if (codes.includes("timeout-or-duplicate")) return { ok: false, reason: "expired" };
        if (codes.some((c) => c === "internal-error")) return { ok: false, reason: "unavailable" };
        return { ok: false, reason: "invalid" };
      }
      if (checks.checkAction && body.action !== TURNSTILE_ACTION) return { ok: false, reason: "mismatch" };
      if (checks.expectedHostnames && !checks.expectedHostnames.includes((body.hostname ?? "").toLowerCase())) {
        return { ok: false, reason: "mismatch" };
      }
      return { ok: true };
    },
  };
}
