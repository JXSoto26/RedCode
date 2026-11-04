import "server-only";
import { deploymentEnv, deploymentProblems, isTurnstileTestKey } from "@/lib/deployment";
import { privacyPolicyFinal } from "@/lib/privacy";
import { createResendMailer } from "./resend-mailer";
import { createSupabaseAdminClient, createSupabaseQuoteRepository } from "./supabase-repository";
import type { SubmitDeps } from "./service";
import { createTurnstileVerifier } from "./turnstile";
import type { EmailSettings } from "./types";

/**
 * Server-only configuration for quote requests. Reads private environment
 * variables (never NEXT_PUBLIC_*). Values are never logged.
 */

const env = (name: string) => {
  const value = process.env[name]?.trim();
  return value ? value : null;
};

const parseList = (value: string | null) =>
  value
    ? value
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : [];

export type TurnstileConfig =
  | { status: "enabled"; siteKey: string; secretKey: string; expectedHostnames: string[] | null; testKeys: boolean }
  | { status: "disabled" }
  | { status: "misconfigured"; reason: string };

/**
 * Turnstile (anti-spam) settings.
 * - Production: both keys, real (not Cloudflare test) keys and the expected
 *   hostnames are required; otherwise the form stays disabled.
 * - Elsewhere: enforced whenever keys are set; Cloudflare test keys allowed.
 */
export function getTurnstileConfig(): TurnstileConfig {
  const siteKey = env("TURNSTILE_SITE_KEY");
  const secretKey = env("TURNSTILE_SECRET_KEY");
  const hostnames = parseList(env("TURNSTILE_EXPECTED_HOSTNAMES"));
  const production = deploymentEnv() === "production";

  if (!siteKey && !secretKey) {
    return production ? { status: "misconfigured", reason: "turnstile_missing" } : { status: "disabled" };
  }
  if (!siteKey || !secretKey) return { status: "misconfigured", reason: "turnstile_incomplete" };
  const testKeys = isTurnstileTestKey(siteKey) || isTurnstileTestKey(secretKey);
  if (production && testKeys) return { status: "misconfigured", reason: "turnstile_test_keys" };
  if (production && hostnames.length === 0) return { status: "misconfigured", reason: "turnstile_hostnames_missing" };
  return { status: "enabled", siteKey, secretKey, expectedHostnames: hostnames.length ? hostnames : null, testKeys };
}

/**
 * True when requests can be accepted. Fails closed: wrong environment, broken
 * anti-spam settings or, in Production, a draft privacy policy disable the form.
 */
export function isQuoteSubmissionEnabled() {
  if (!(env("SUPABASE_URL") && env("SUPABASE_SECRET_KEY") && env("QUOTE_RATE_LIMIT_SECRET"))) return false;
  if (deploymentProblems().length) return false;
  const turnstile = getTurnstileConfig();
  if (turnstile.status === "misconfigured") return false;
  if (deploymentEnv() === "production" && (turnstile.status !== "enabled" || !privacyPolicyFinal())) return false;
  return true;
}

/** Public Turnstile site key for the form, or null when not enforced. */
export function turnstileSiteKey() {
  const t = getTurnstileConfig();
  return t.status === "enabled" ? t.siteKey : null;
}

/**
 * Email delivery is opt-in: unless QUOTE_EMAIL_DELIVERY=all, only addresses in
 * QUOTE_EMAIL_ALLOWLIST receive email (an empty allowlist sends nothing).
 */
export function getEmailSettings(options: { timeoutMs?: number } = {}): EmailSettings | null {
  const apiKey = env("RESEND_API_KEY");
  const from = env("QUOTE_EMAIL_FROM");
  const ownerEmail = env("QUOTE_NOTIFY_EMAIL");
  if (!apiKey || !from || !ownerEmail) return null;

  const deliverToAll = env("QUOTE_EMAIL_DELIVERY") === "all";
  return {
    mailer: createResendMailer(apiKey, from, fetch, options.timeoutMs),
    from,
    ownerEmail,
    replyTo: env("QUOTE_EMAIL_REPLY_TO"),
    allowlist: deliverToAll ? null : parseList(env("QUOTE_EMAIL_ALLOWLIST")),
  };
}

export function getSubmitDeps(): SubmitDeps | null {
  if (!isQuoteSubmissionEnabled()) return null;
  const client = createSupabaseAdminClient(env("SUPABASE_URL")!, env("SUPABASE_SECRET_KEY")!);
  const turnstile = getTurnstileConfig();
  return {
    repo: createSupabaseQuoteRepository(client),
    bucketSecret: env("QUOTE_RATE_LIMIT_SECRET")!,
    turnstile:
      turnstile.status === "enabled"
        ? createTurnstileVerifier(turnstile.secretKey, {
            expectedHostnames: turnstile.testKeys ? null : turnstile.expectedHostnames,
            checkAction: !turnstile.testKeys,
          })
        : null,
    email: getEmailSettings(),
    log: (event, details) => console.warn(`[quote] ${event}`, details),
  };
}
