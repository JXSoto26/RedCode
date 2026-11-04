import type {
  EmailMessage,
  InsertResult,
  Mailer,
  NewQuoteRecord,
  NotificationKind,
  NotificationUpdate,
  QuoteRepository,
  StoredQuote,
} from "@/lib/quote/types";

type Row = NewQuoteRecord & {
  id: string;
  createdAt: string;
  notifications: Partial<Record<NotificationKind, NotificationUpdate>>;
};

/** In-memory repository with the same unique constraints as the database. */
export function createFakeRepo(options: { failInsert?: boolean; failRateLimit?: boolean } = {}) {
  const rows: Row[] = [];
  const hits = new Map<string, number>();
  let seq = 0;
  const toStored = (r: Row): StoredQuote => ({
    id: r.id,
    reference: r.reference,
    createdAt: r.createdAt,
    payloadHash: r.payloadHash,
    visitorEmailStatus: r.notifications.visitor?.status ?? "pendiente",
  });
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  const repo: QuoteRepository = {
    async findByIdempotencyKey(key) {
      await tick();
      const row = rows.find((r) => r.idempotencyKey === key);
      return row ? toStored(row) : null;
    },
    async insert(record): Promise<InsertResult> {
      await tick();
      if (options.failInsert) {
        throw Object.assign(new Error("connection refused for ana@example.com"), { code: "ECONNREFUSED" });
      }
      // Check + write happen in the same tick, like a unique index.
      if (rows.some((r) => r.idempotencyKey === record.idempotencyKey)) {
        return { ok: false, reason: "duplicate_idempotency" };
      }
      if (rows.some((r) => r.reference === record.reference)) return { ok: false, reason: "duplicate_reference" };
      const row: Row = { ...record, id: `id-${++seq}`, createdAt: new Date().toISOString(), notifications: {} };
      rows.push(row);
      return { ok: true, quote: toStored(row) };
    },
    async updateNotification(id, kind, update) {
      await tick();
      const row = rows.find((r) => r.id === id);
      if (row) row.notifications[kind] = update;
    },
    async hitRateLimit(bucket, _windowSeconds, limit) {
      await tick();
      if (options.failRateLimit) throw new Error("rpc_failed");
      const count = (hits.get(bucket) ?? 0) + 1;
      hits.set(bucket, count);
      return count <= limit;
    },
  };
  return { repo, rows, hits };
}

export function createFakeMailer(behavior: "ok" | "fail" | "throw" = "ok") {
  const sent: EmailMessage[] = [];
  const mailer: Mailer = {
    async send(message) {
      sent.push(message);
      if (behavior === "throw") throw new Error("boom");
      return behavior === "ok"
        ? { ok: true, id: `msg-${sent.length}` }
        : { ok: false, error: "http_500_internal_server_error" };
    },
  };
  return { mailer, sent };
}
