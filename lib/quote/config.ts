import "server-only";
import { createResendMailer } from "./resend-mailer";
import { createSupabaseAdminClient, createSupabaseQuoteRepository } from "./supabase-repository";
import type { SubmitDeps } from "./service";
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

/** True when the request can be saved: Supabase + rate-limit secret are set. */
export function isQuoteSubmissionEnabled() {
  return Boolean(env("SUPABASE_URL") && env("SUPABASE_SECRET_KEY") && env("QUOTE_RATE_LIMIT_SECRET"));
}

/**
 * Email delivery is opt-in: unless QUOTE_EMAIL_DELIVERY=all, only addresses in
 * QUOTE_EMAIL_ALLOWLIST receive email (an empty allowlist sends nothing).
 */
export function getEmailSettings(): EmailSettings | null {
  const apiKey = env("RESEND_API_KEY");
  const from = env("QUOTE_EMAIL_FROM");
  const ownerEmail = env("QUOTE_NOTIFY_EMAIL");
  if (!apiKey || !from || !ownerEmail) return null;

  const deliverToAll = env("QUOTE_EMAIL_DELIVERY") === "all";
  return {
    mailer: createResendMailer(apiKey, from),
    ownerEmail,
    replyTo: env("QUOTE_EMAIL_REPLY_TO"),
    allowlist: deliverToAll ? null : parseList(env("QUOTE_EMAIL_ALLOWLIST")),
  };
}

export function getSubmitDeps(): SubmitDeps | null {
  if (!isQuoteSubmissionEnabled()) return null;
  const client = createSupabaseAdminClient(env("SUPABASE_URL")!, env("SUPABASE_SECRET_KEY")!);
  return {
    repo: createSupabaseQuoteRepository(client),
    bucketSecret: env("QUOTE_RATE_LIMIT_SECRET")!,
    email: getEmailSettings(),
    log: (event, details) => console.warn(`[quote] ${event}`, details),
  };
}
