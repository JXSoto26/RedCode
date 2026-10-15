import { describe, expect, it, vi } from "vitest";
import { MIN_FILL_MS, RATE_LIMITS, submitQuoteRequest, type SubmitDeps } from "@/lib/quote/service";
import { createFakeMailer, createFakeRepo } from "./fakes";
import { NOW, validValues } from "./fixtures";

const KEY = "3f1c2b8e-6a1d-4c2e-9f3b-1a2b3c4d5e6f";
const OWNER = "jeremy@example.com";
const keyN = (n: number) => `3f1c2b8e-6a1d-4c2e-9f3b-${String(n).padStart(12, "0")}`;

function envelope(overrides: Record<string, unknown> = {}, data = validValues()) {
  return { idempotencyKey: KEY, website: "", startedAt: NOW.getTime() - 60_000, data, ...overrides };
}

type SetupOptions = {
  repo?: Parameters<typeof createFakeRepo>[0];
  mailer?: "ok" | "fail" | "throw" | null;
  allowlist?: string[] | null;
};

function setup(opts: SetupOptions = {}) {
  const fake = createFakeRepo(opts.repo);
  const mail = createFakeMailer(opts.mailer ?? "ok");
  const log = vi.fn();
  const deps: SubmitDeps = {
    repo: fake.repo,
    bucketSecret: "test-secret",
    email:
      opts.mailer === null
        ? null
        : { mailer: mail.mailer, ownerEmail: OWNER, replyTo: null, allowlist: opts.allowlist ?? null },
    log,
  };
  return { ...fake, ...mail, deps, log };
}

const ctx = { ip: "203.0.113.7", now: NOW };

describe("submitQuoteRequest", () => {
  it("saves the request first, then sends both emails", async () => {
    const t = setup();
    const result = await submitQuoteRequest(envelope(), ctx, t.deps);
    expect(result).toMatchObject({ status: "created", visitorEmail: "enviado" });
    if (result.status !== "created") return;
    expect(result.reference).toMatch(/^RC-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0].data.email).toBe("ana@example.com");
    expect(t.sent.map((m) => m.to).sort()).toEqual(["ana@example.com", OWNER]);
    expect(t.sent.every((m) => m.idempotencyKey.startsWith(`quote-${t.rows[0].id}-`))).toBe(true);
    expect(t.rows[0].notifications.visitor).toMatchObject({ status: "enviado", attempts: 1 });
    expect(t.rows[0].notifications.owner).toMatchObject({ status: "enviado", attempts: 1 });
  });

  it("does not promise response times in the visitor email", async () => {
    const t = setup();
    await submitQuoteRequest(envelope(), ctx, t.deps);
    const visitor = t.sent.find((m) => m.to === "ana@example.com")!;
    expect(visitor.text).toContain("No constituye una cotización ni reserva una fecha");
    expect(visitor.text).not.toMatch(/\d+\s*(horas|días)/);
  });

  describe("idempotency", () => {
    it("returns the original request when the same submission is retried", async () => {
      const t = setup();
      const first = await submitQuoteRequest(envelope(), ctx, t.deps);
      const second = await submitQuoteRequest(envelope(), ctx, t.deps);
      expect(second).toMatchObject({ status: "replayed" });
      if (first.status !== "created" || second.status !== "replayed") return;
      expect(second.reference).toBe(first.reference);
      expect(t.rows).toHaveLength(1);
      expect(t.sent).toHaveLength(2); // no second round of emails
    });

    it("creates exactly one request on a concurrent double click", async () => {
      const t = setup();
      const [a, b] = await Promise.all([
        submitQuoteRequest(envelope(), ctx, t.deps),
        submitQuoteRequest(envelope(), ctx, t.deps),
      ]);
      expect(t.rows).toHaveLength(1);
      expect([a.status, b.status].sort()).toEqual(["created", "replayed"]);
      if ("reference" in a && "reference" in b) expect(a.reference).toBe(b.reference);
    });

    it("rejects reusing a key with different data", async () => {
      const t = setup();
      await submitQuoteRequest(envelope(), ctx, t.deps);
      const other = await submitQuoteRequest(
        envelope({}, validValues({ goal: "Otro objetivo distinto." })),
        ctx,
        t.deps
      );
      expect(other).toEqual({ status: "conflict" });
      expect(t.rows).toHaveLength(1);
    });

    it("does not count replays against the rate limit", async () => {
      const t = setup();
      for (let i = 0; i < 10; i++) await submitQuoteRequest(envelope(), ctx, t.deps);
      expect(Math.max(...t.hits.values())).toBe(1);
    });
  });

  describe("spam protection", () => {
    it("rejects a filled honeypot without saving", async () => {
      const t = setup();
      const result = await submitQuoteRequest(envelope({ website: "http://spam.example" }), ctx, t.deps);
      expect(result).toEqual({ status: "spam" });
      expect(t.rows).toHaveLength(0);
    });

    it("rejects submissions faster than a person could fill the form", async () => {
      const t = setup();
      const fast = envelope({ startedAt: NOW.getTime() - (MIN_FILL_MS - 1) });
      expect(await submitQuoteRequest(fast, ctx, t.deps)).toEqual({ status: "spam" });
      expect(t.rows).toHaveLength(0);
    });

    it("limits requests per IP using the shared store", async () => {
      const t = setup();
      const statuses: string[] = [];
      for (let i = 0; i <= RATE_LIMITS.ip.limit; i++) {
        const data = validValues({ email: `persona${i}@example.com` });
        const result = await submitQuoteRequest(envelope({ idempotencyKey: keyN(i) }, data), ctx, t.deps);
        statuses.push(result.status);
      }
      expect(statuses.slice(0, RATE_LIMITS.ip.limit).every((s) => s === "created")).toBe(true);
      expect(statuses.at(-1)).toBe("rate_limited");
      expect(t.rows).toHaveLength(RATE_LIMITS.ip.limit);
    });

    it("limits requests per email across different IPs", async () => {
      const t = setup();
      const statuses: string[] = [];
      for (let i = 0; i <= RATE_LIMITS.email.limit; i++) {
        const result = await submitQuoteRequest(
          envelope({ idempotencyKey: keyN(100 + i) }),
          { ip: `198.51.100.${i}`, now: NOW },
          t.deps
        );
        statuses.push(result.status);
      }
      expect(statuses.at(-1)).toBe("rate_limited");
    });

    it("never stores raw IPs or emails in rate-limit buckets", async () => {
      const t = setup();
      await submitQuoteRequest(envelope(), ctx, t.deps);
      const buckets = [...t.hits.keys()].join(" ");
      expect(buckets).not.toContain("203.0.113.7");
      expect(buckets).not.toContain("example.com");
    });
  });

  it("rejects malformed envelopes and invalid data with field errors", async () => {
    const t = setup();
    expect(await submitQuoteRequest({ data: validValues() }, ctx, t.deps)).toEqual({ status: "bad_request" });
    expect(await submitQuoteRequest(envelope({ idempotencyKey: "1" }), ctx, t.deps)).toEqual({ status: "bad_request" });
    const invalid = await submitQuoteRequest(envelope({}, validValues({ email: "x" })), ctx, t.deps);
    expect(invalid).toMatchObject({ status: "invalid", fieldErrors: { email: expect.any(String) } });
    expect(t.rows).toHaveLength(0);
  });

  describe("failures", () => {
    it("reports persistence failure without sending email or logging personal data", async () => {
      const t = setup({ repo: { failInsert: true } });
      const result = await submitQuoteRequest(envelope(), ctx, t.deps);
      expect(result).toEqual({ status: "persist_failed" });
      expect(t.sent).toHaveLength(0);
      expect(JSON.stringify(t.log.mock.calls)).not.toMatch(/ana|example\.com|Panader/i);
      expect(t.log).toHaveBeenCalledWith("quote_persist_failed", { error: "ECONNREFUSED" });
    });

    it("fails closed when the rate-limit store is unavailable", async () => {
      const t = setup({ repo: { failRateLimit: true } });
      expect(await submitQuoteRequest(envelope(), ctx, t.deps)).toEqual({ status: "persist_failed" });
      expect(t.rows).toHaveLength(0);
    });

    it("keeps the request valid when email fails and records it for retry", async () => {
      const t = setup({ mailer: "fail" });
      const result = await submitQuoteRequest(envelope(), ctx, t.deps);
      expect(result).toMatchObject({ status: "created", visitorEmail: "fallido" });
      expect(t.rows).toHaveLength(1);
      expect(t.rows[0].notifications.visitor).toMatchObject({
        status: "fallido",
        attempts: 1,
        error: "http_500_internal_server_error",
      });
      expect(t.rows[0].notifications.owner).toMatchObject({ status: "fallido" });
      // A client retry with the same key does not duplicate the request or resend.
      const retry = await submitQuoteRequest(envelope(), ctx, t.deps);
      expect(retry).toMatchObject({ status: "replayed", visitorEmail: "fallido" });
      expect(t.rows).toHaveLength(1);
      expect(t.sent).toHaveLength(2);
    });

    it("treats a throwing mailer as a recorded failure, not a lost request", async () => {
      const t = setup({ mailer: "throw" });
      const result = await submitQuoteRequest(envelope(), ctx, t.deps);
      expect(result).toMatchObject({ status: "created", visitorEmail: "fallido" });
    });

    it("records 'omitido' when email is not configured", async () => {
      const t = setup({ mailer: null });
      const result = await submitQuoteRequest(envelope(), ctx, t.deps);
      expect(result).toMatchObject({ status: "created", visitorEmail: "omitido" });
      expect(t.rows[0].notifications.visitor).toMatchObject({ status: "omitido", error: "email_not_configured" });
    });

    it("only emails allowlisted recipients", async () => {
      const t = setup({ allowlist: [OWNER] });
      const result = await submitQuoteRequest(envelope(), ctx, t.deps);
      expect(result).toMatchObject({ visitorEmail: "omitido" });
      expect(t.sent.map((m) => m.to)).toEqual([OWNER]);
      expect(t.rows[0].notifications.visitor).toMatchObject({ error: "recipient_not_in_allowlist" });
    });

    it("sends nothing with an empty allowlist", async () => {
      const t = setup({ allowlist: [] });
      await submitQuoteRequest(envelope(), ctx, t.deps);
      expect(t.sent).toHaveLength(0);
    });
  });
});
