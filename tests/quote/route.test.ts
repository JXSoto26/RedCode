import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SubmitDeps } from "@/lib/quote/service";
import { createFakeMailer, createFakeRepo } from "./fakes";
import { validValues } from "./fixtures";

const mockDeps = vi.hoisted(() => ({ current: null as SubmitDeps | null }));
vi.mock("@/lib/quote/config", () => ({
  getSubmitDeps: () => mockDeps.current,
  isQuoteSubmissionEnabled: () => mockDeps.current !== null,
}));

import * as route from "@/app/api/quote-requests/route";

const KEY = "3f1c2b8e-6a1d-4c2e-9f3b-1a2b3c4d5e6f";

function post(body: unknown, headers: Record<string, string> = {}) {
  return route.POST(
    new Request("http://localhost:3000/api/quote-requests", {
      method: "POST",
      headers: { "content-type": "application/json", host: "localhost:3000", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

const validBody = () => ({
  idempotencyKey: KEY,
  website: "",
  startedAt: Date.now() - 60_000,
  data: validValues({ desiredDate: "" }),
});

describe("POST /api/quote-requests", () => {
  beforeEach(() => {
    mockDeps.current = null;
  });
  afterEach(() => vi.restoreAllMocks());

  it("exports no read handlers: requests can't be fetched publicly, not even by reference", () => {
    expect(Object.keys(route).filter((k) => /^(GET|HEAD|PUT|PATCH|DELETE)$/.test(k))).toEqual([]);
  });

  it("reports that submissions are unavailable when not configured", async () => {
    const res = await post(validBody());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "not_configured" });
  });

  describe("when configured", () => {
    let fake: ReturnType<typeof createFakeRepo>;
    beforeEach(() => {
      fake = createFakeRepo();
      mockDeps.current = {
        repo: fake.repo,
        bucketSecret: "s",
        email: { mailer: createFakeMailer().mailer, from: "RedCode <a@b.dev>", ownerEmail: "o@example.com", replyTo: null, allowlist: null },
      };
    });

    it("creates a request and returns only the reference and email status", async () => {
      const res = await post(validBody());
      expect(res.status).toBe(201);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const body = await res.json();
      expect(Object.keys(body).sort()).toEqual(["createdAt", "reference", "visitorEmail"]);
      expect(body.visitorEmail).toBe("enviado");
    });

    it("returns the same reference on retry (200) without duplicating", async () => {
      const first = await (await post(validBody())).json();
      const res = await post(validBody());
      expect(res.status).toBe(200);
      expect((await res.json()).reference).toBe(first.reference);
      expect(fake.rows).toHaveLength(1);
    });

    it("refuses a failed Turnstile check with 403 and saves nothing", async () => {
      mockDeps.current = { ...mockDeps.current!, turnstile: { verify: async () => ({ ok: false, reason: "expired" }) } };
      const res = await post({ ...validBody(), turnstileToken: "tok" });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "challenge_failed", reason: "expired" });
      expect(fake.rows).toHaveLength(0);
    });

    it("rejects cross-origin posts", async () => {
      const res = await post(validBody(), { origin: "https://evil.example" });
      expect(res.status).toBe(403);
      expect(fake.rows).toHaveLength(0);
    });

    it("accepts a Vercel Preview URL posting to itself", async () => {
      const preview = "red-code-git-feature-cotizar-red-code-web-desing.vercel.app";
      const res = await post(validBody(), {
        host: "internal.vercel",
        "x-forwarded-host": preview,
        origin: `https://${preview}`,
      });
      expect(res.status).toBe(201);
    });

    it("rejects another vercel.app origin posting to a Preview URL", async () => {
      const res = await post(validBody(), {
        host: "internal.vercel",
        "x-forwarded-host": "red-code-git-feature-cotizar-red-code-web-desing.vercel.app",
        origin: "https://other-project.vercel.app",
      });
      expect(res.status).toBe(403);
      expect(fake.rows).toHaveLength(0);
    });

    it("rejects non-JSON, oversized and malformed bodies", async () => {
      expect((await post(validBody(), { "content-type": "text/plain" })).status).toBe(415);
      expect((await post("x".repeat(40_000))).status).toBe(413);
      expect((await post("{not json")).status).toBe(400);
    });

    it("returns field errors for invalid data", async () => {
      const res = await post({ ...validBody(), data: validValues({ email: "nope" }) });
      expect(res.status).toBe(422);
      expect((await res.json()).fieldErrors).toHaveProperty("email");
    });

    it("answers spam with a generic 400 and saves nothing", async () => {
      const res = await post({ ...validBody(), website: "spam" });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "bad_request" });
      expect(fake.rows).toHaveLength(0);
    });

    it("returns 503 persist_failed when the database fails", async () => {
      mockDeps.current = { ...mockDeps.current!, repo: createFakeRepo({ failInsert: true }).repo, log: () => {} };
      const res = await post(validBody());
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: "persist_failed" });
    });
  });
});
