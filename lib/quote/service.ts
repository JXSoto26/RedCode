import { z } from "zod";
import { generateReference, hashBucket, hashPayload } from "./crypto";
import { ownerNotificationEmail, visitorConfirmationEmail } from "./emails";
import type { NotificationStatus } from "./options";
import { parseQuoteRequest, type FieldErrors, type QuoteRequestData } from "./schema";
import type {
  EmailMessage,
  EmailSettings,
  NotificationKind,
  QuoteRepository,
  StoredQuote,
} from "./types";

/** Submissions faster than this after the form loaded are treated as bots. */
export const MIN_FILL_MS = 3_000;

export const RATE_LIMITS = {
  ip: { windowSeconds: 60 * 60, limit: 5 },
  email: { windowSeconds: 24 * 60 * 60, limit: 3 },
} as const;

const MAX_REFERENCE_ATTEMPTS = 3;

const envelopeSchema = z.object({
  idempotencyKey: z.uuid(),
  /** Honeypot: hidden from people, often filled by bots. */
  website: z.string().max(200),
  /** Client timestamp (ms) when the form was first rendered. */
  startedAt: z.number().int().nonnegative(),
  data: z.unknown(),
});

export type SubmitDeps = {
  repo: QuoteRepository;
  /** Secret used to hash rate-limit buckets. */
  bucketSecret: string;
  /** Null when email is not configured: notifications are recorded as "omitido". */
  email: EmailSettings | null;
  log?: (event: string, details: Record<string, string | number | boolean | null>) => void;
};

export type SubmitContext = { ip: string | null; now: Date };

export type SubmitResult =
  | {
      status: "created" | "replayed";
      reference: string;
      createdAt: string;
      visitorEmail: NotificationStatus;
    }
  | { status: "invalid"; fieldErrors: FieldErrors }
  | { status: "bad_request" }
  | { status: "spam" }
  | { status: "rate_limited" }
  | { status: "conflict" }
  | { status: "persist_failed" };

const noopLog: NonNullable<SubmitDeps["log"]> = () => {};

export async function submitQuoteRequest(
  raw: unknown,
  ctx: SubmitContext,
  deps: SubmitDeps
): Promise<SubmitResult> {
  const log = deps.log ?? noopLog;

  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success) return { status: "bad_request" };
  const { idempotencyKey, website, startedAt, data } = envelope.data;

  if (website.trim() !== "" || ctx.now.getTime() - startedAt < MIN_FILL_MS) {
    log("quote_spam_rejected", { honeypot: website.trim() !== "" });
    return { status: "spam" };
  }

  const parsed = parseQuoteRequest(data, ctx.now);
  if (!parsed.success) return { status: "invalid", fieldErrors: parsed.fieldErrors };
  const request = parsed.data;
  const payloadHash = hashPayload(request);

  try {
    // A retry of an already-saved submission returns the original result.
    const existing = await deps.repo.findByIdempotencyKey(idempotencyKey);
    if (existing) return replay(existing, payloadHash);

    const ipAllowed = await deps.repo.hitRateLimit(
      `ip:${hashBucket(deps.bucketSecret, ctx.ip ?? "unknown")}`,
      RATE_LIMITS.ip.windowSeconds,
      RATE_LIMITS.ip.limit
    );
    const emailAllowed =
      ipAllowed &&
      (await deps.repo.hitRateLimit(
        `email:${hashBucket(deps.bucketSecret, request.email)}`,
        RATE_LIMITS.email.windowSeconds,
        RATE_LIMITS.email.limit
      ));
    if (!ipAllowed || !emailAllowed) {
      log("quote_rate_limited", { scope: ipAllowed ? "email" : "ip" });
      return { status: "rate_limited" };
    }

    let saved: StoredQuote | null = null;
    for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS && !saved; attempt++) {
      const result = await deps.repo.insert({
        reference: generateReference(),
        idempotencyKey,
        payloadHash,
        consentedAt: ctx.now.toISOString(),
        data: request,
      });
      if (result.ok) saved = result.quote;
      else if (result.reason === "duplicate_idempotency") {
        // A concurrent request with the same key won the race (e.g. double click).
        const winner = await deps.repo.findByIdempotencyKey(idempotencyKey);
        if (!winner) throw new Error("idempotency_conflict_without_row");
        return replay(winner, payloadHash);
      }
    }
    if (!saved) throw new Error("reference_collisions_exhausted");

    log("quote_saved", { ref: saved.reference });
    const visitorEmail = await sendNotifications(saved, request, deps);
    return {
      status: "created",
      reference: saved.reference,
      createdAt: saved.createdAt,
      visitorEmail,
    };
  } catch (error) {
    log("quote_persist_failed", { error: errorCode(error) });
    return { status: "persist_failed" };
  }
}

function replay(existing: StoredQuote, payloadHash: string): SubmitResult {
  if (existing.payloadHash !== payloadHash) return { status: "conflict" };
  return {
    status: "replayed",
    reference: existing.reference,
    createdAt: existing.createdAt,
    visitorEmail: existing.visitorEmailStatus,
  };
}

/**
 * Sends both notifications after the request is saved. Never throws: failures
 * are recorded on the row so they can be retried without duplicating anything.
 * Returns the visitor confirmation status.
 */
export async function sendNotifications(
  quote: Pick<StoredQuote, "id" | "reference">,
  request: QuoteRequestData,
  deps: Pick<SubmitDeps, "repo" | "email" | "log">,
  previousAttempts: Partial<Record<NotificationKind, number>> = {},
  only?: NotificationKind[]
): Promise<NotificationStatus> {
  const log = deps.log ?? noopLog;
  const email = deps.email;

  const build = (kind: NotificationKind): EmailMessage | null => {
    if (!email) return null;
    if (kind === "visitor") {
      const m = visitorConfirmationEmail(quote.reference, request, Boolean(email.replyTo));
      return {
        to: request.email,
        ...m,
        replyTo: email.replyTo ?? undefined,
        idempotencyKey: `quote-${quote.id}-visitor`,
      };
    }
    const m = ownerNotificationEmail(quote.reference, request);
    return {
      to: email.ownerEmail,
      ...m,
      replyTo: request.email,
      idempotencyKey: `quote-${quote.id}-owner`,
    };
  };

  const run = async (kind: NotificationKind): Promise<NotificationStatus> => {
    const message = build(kind);
    const attempts = previousAttempts[kind] ?? 0;
    let status: NotificationStatus;
    let error: string | null = null;
    let sentAt: string | null = null;
    let nextAttempts = attempts;

    if (!message) {
      status = "omitido";
      error = "email_not_configured";
    } else if (email?.allowlist && !email.allowlist.includes(message.to.toLowerCase())) {
      status = "omitido";
      error = "recipient_not_in_allowlist";
    } else {
      nextAttempts = attempts + 1;
      const result = await email!.mailer.send(message).catch(
        (e: unknown) => ({ ok: false, error: errorCode(e) }) as const
      );
      if (result.ok) {
        status = "enviado";
        sentAt = new Date().toISOString();
      } else {
        status = "fallido";
        error = result.error;
      }
    }

    if (status !== "enviado") log("quote_email_not_sent", { ref: quote.reference, kind, status, error });
    try {
      await deps.repo.updateNotification(quote.id, kind, { status, attempts: nextAttempts, error, sentAt });
    } catch (e) {
      log("quote_notification_update_failed", { ref: quote.reference, kind, error: errorCode(e) });
    }
    return status;
  };

  const kinds = only ?? (["visitor", "owner"] as NotificationKind[]);
  const results = await Promise.all(kinds.map(async (kind) => [kind, await run(kind)] as const));
  return results.find(([kind]) => kind === "visitor")?.[1] ?? "pendiente";
}

/** A short code safe to log: never the message of provider/database errors. */
export function errorCode(error: unknown) {
  if (error && typeof error === "object") {
    const e = error as { code?: unknown; name?: unknown };
    if (typeof e.code === "string" && /^[\w.-]{1,40}$/.test(e.code)) return e.code;
    if (typeof e.name === "string" && /^[\w.-]{1,40}$/.test(e.name) && e.name !== "Error") return e.name;
    if (error instanceof Error && /^[a-z_]{1,60}$/.test(error.message)) return error.message;
  }
  return "unknown_error";
}
