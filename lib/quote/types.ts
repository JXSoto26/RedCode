import type { NotificationStatus } from "./options";
import type { QuoteRequestData } from "./schema";

export type NotificationKind = "visitor" | "owner";

export type StoredQuote = {
  id: string;
  reference: string;
  createdAt: string;
  payloadHash: string;
  visitorEmailStatus: NotificationStatus;
};

export type NewQuoteRecord = {
  reference: string;
  idempotencyKey: string;
  payloadHash: string;
  consentedAt: string;
  data: QuoteRequestData;
};

export type InsertResult =
  | { ok: true; quote: StoredQuote }
  | { ok: false; reason: "duplicate_idempotency" | "duplicate_reference" };

export type NotificationUpdate = {
  status: NotificationStatus;
  attempts: number;
  /** Short, non-personal error code (never provider messages, which may contain addresses). */
  error: string | null;
  sentAt: string | null;
};

/** Persistence port. The Supabase implementation lives in supabase-repository.ts. */
export interface QuoteRepository {
  findByIdempotencyKey(key: string): Promise<StoredQuote | null>;
  /** Throws on unexpected errors; returns a reason for unique-constraint conflicts. */
  insert(record: NewQuoteRecord): Promise<InsertResult>;
  updateNotification(id: string, kind: NotificationKind, update: NotificationUpdate): Promise<void>;
  /** Counts one hit in a fixed window and returns true while under the limit. */
  hitRateLimit(bucket: string, windowSeconds: number, limit: number): Promise<boolean>;
}

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  /** Provider-side idempotency key so retries never send twice. */
  idempotencyKey: string;
  /** Overrides the mailer's default sender (used to repeat a send exactly). */
  from?: string;
  /** Files attached as base64 content. */
  attachments?: { filename: string; content: string }[];
};

export type SendResult = { ok: true; id: string | null } | { ok: false; error: string };

/** Email port. The Resend implementation lives in resend-mailer.ts. */
export interface Mailer {
  send(message: EmailMessage): Promise<SendResult>;
}

export type EmailSettings = {
  mailer: Mailer;
  /** Configured sender (QUOTE_EMAIL_FROM). */
  from: string;
  ownerEmail: string;
  replyTo: string | null;
  /** Lowercased addresses allowed to receive email; null means any address. */
  allowlist: string[] | null;
};
