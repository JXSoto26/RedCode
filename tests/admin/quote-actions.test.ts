import { createHash, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailMessage, SendResult } from "@/lib/quote/types";

/**
 * Finalize and send flows against a stateful fake of the database functions
 * (same rules as supabase/migrations/*_quote_sending.sql, which the live SQL
 * tests check) and a fake Resend that counts calls.
 */

const env = vi.hoisted(() => ({
  client: null as unknown,
  settings: null as unknown,
}));

vi.mock("@/lib/admin/supabase", () => ({ createAdminSupabase: async () => env.client }));
vi.mock("@/lib/quote/config", () => ({ getEmailSettings: () => env.settings }));
vi.mock("@/lib/admin/quote-pdf", () => ({ renderQuotePdf: async () => Buffer.from("%PDF-1.3 fake quote") }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { confirmSend, finalizeQuote, generateQuotePdf, reconcileSend, resolveSend } from "@/lib/admin/quote-actions";

const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const REQUEST_ID = "3f1c2b8e-6a1d-4c2e-9f3b-1a2b3c4d5e6f";
const QUOTE_ID = "7d2f6a1e-1b2c-4d3e-8f90-123456789abc";
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

type Send = Record<string, unknown> & { id: string; status: string; attempts: number; request_key: string };

function backend(opts: { admin?: boolean; sub?: string | null; draftComplete?: boolean; withPdf?: boolean } = {}) {
  const sub = opts.sub === undefined ? ADMIN : opts.sub;
  const files = new Map<string, Uint8Array>();
  const sends: Send[] = [];
  const rpcCalls: string[] = [];
  const failures: Record<string, { code: string } | undefined> = {};

  const quote: Record<string, unknown> = {
    id: QUOTE_ID,
    quote_request_id: REQUEST_ID,
    quote_reference: "COT-TSR0-1QA9",
    revision: 1,
    draft_version: 4,
    business_name: "PRUEBA Negocio",
    contact_name: "Ana",
    recipient_email: "redcodepr@gmail.com",
    title: "Título",
    summary: "Alcance",
    deliverables: "Página",
    exclusions: null,
    estimated_time: null,
    terms: null,
    validity: null,
    currency: "USD",
    total_cents: 100000,
    issued_by_email: "admin@example.com",
    issued_at: "2026-10-15T17:00:00Z",
    pdf_path: null,
    pdf_sha256: null,
    pdf_size_bytes: null,
    pdf_generated_at: null,
    quote_items: [{ position: 0, description: "Diseño", quantity: "1.00", unit_price_cents: 100000, line_total_cents: 100000 }],
    quote_requests: { reference: "RC-TSR0-1QA9", status: "nueva" },
  };
  if (opts.withPdf !== false) {
    const bytes = new TextEncoder().encode("%PDF stored");
    files.set(`${QUOTE_ID}/cotizacion-rev-1.pdf`, bytes);
    Object.assign(quote, {
      pdf_path: `${QUOTE_ID}/cotizacion-rev-1.pdf`,
      pdf_sha256: sha(bytes),
      pdf_size_bytes: bytes.byteLength,
      pdf_generated_at: "2026-10-15T17:00:01Z",
    });
  }

  const request = {
    id: REQUEST_ID,
    reference: "RC-TSR0-1QA9",
    created_at: "2026-10-15T13:50:00Z",
    updated_at: "2026-10-15T13:50:00Z",
    status: "nueva",
    consented_at: "2026-10-15T13:50:00Z",
    contact_name: "Ana",
    business_name: "PRUEBA Negocio",
    email: "redcodepr@gmail.com",
    business_type: "otro",
    service: "landing_page",
    goal: "x",
    logo_status: "disponible",
    copy_status: "disponible",
    photos_status: "disponible",
    sections: [],
    features: [],
    consent_version: "v",
    visitor_email_status: "enviado",
    visitor_email_attempts: 1,
    owner_email_status: "enviado",
    owner_email_attempts: 1,
  };
  const draft = {
    id: "d1",
    version: 4,
    title: "Título",
    summary: "Alcance",
    deliverables: opts.draftComplete === false ? null : "Página",
    exclusions: null,
    estimated_time: null,
    terms: null,
    validity: null,
    updated_at: "2026-10-15T16:00:00Z",
    quote_draft_items: [{ id: "i1", position: 0, description: "Diseño", quantity: "1.00", unit_price_cents: 100000 }],
  };

  const rowsFor = (table: string, filters: [string, unknown][], single: boolean): unknown => {
    switch (table) {
      case "admin_users":
        return opts.admin === false ? null : { user_id: sub };
      case "quote_requests":
        return request;
      case "quote_drafts":
        return draft;
      case "quotes":
        return single ? { ...quote } : [{ ...quote, quote_sends: sends }];
      case "quote_sends":
        if (single) {
          const id = filters.find(([k]) => k === "id")?.[1];
          const s = sends.find((x) => x.id === id);
          return s ? { quote_id: QUOTE_ID } : null;
        }
        return [...sends].reverse();
      default:
        return [];
    }
  };

  const from = (table: string) => {
    const filters: [string, unknown][] = [];
    const q: Record<string, unknown> = {};
    for (const m of ["select", "order", "range", "or"]) q[m] = () => q;
    q.eq = (k: string, v: unknown) => {
      filters.push([k, v]);
      return q;
    };
    q.maybeSingle = async () => ({ data: rowsFor(table, filters, true), error: null });
    q.then = (resolve: (r: unknown) => unknown) => resolve({ data: rowsFor(table, filters, false), error: null });
    return q;
  };

  const rpc = vi.fn(async (name: string, a: Record<string, unknown>) => {
    rpcCalls.push(name);
    if (failures[name]) return { data: null, error: failures[name] };
    switch (name) {
      case "admin_finalize_quote":
        if (a.p_expected_version !== draft.version) return { data: null, error: { code: "RC409" } };
        return { data: [{ quote_id: QUOTE_ID, revision: 1, created: true }], error: null };
      case "admin_attach_quote_pdf":
        Object.assign(quote, { pdf_path: a.p_path, pdf_sha256: a.p_sha256, pdf_size_bytes: a.p_size, pdf_generated_at: "now" });
        return { data: null, error: null };
      case "admin_begin_quote_send": {
        const existing = sends.find((s) => s.request_key === a.p_request_key);
        if (existing) return { data: [{ send_id: existing.id, status: existing.status, existing: true }], error: null };
        if (sends.some((s) => ["pendiente", "en_proceso", "incierto"].includes(s.status))) return { data: null, error: { code: "RC409" } };
        if (a.p_kind === "envio" && sends.some((s) => s.kind === "envio" && s.status === "aceptado")) {
          return { data: null, error: { code: "RC409" } };
        }
        const s: Send = {
          id: randomUUID(),
          request_key: a.p_request_key as string,
          kind: a.p_kind,
          recipient_email: quote.recipient_email,
          subject: (a.p_subject as string).trim(),
          body: (a.p_body as string).trim(),
          pdf_path: quote.pdf_path,
          pdf_sha256: quote.pdf_sha256,
          sender: a.p_sender,
          reply_to: a.p_reply_to,
          status: "pendiente",
          attempts: 0,
          requested_by_email: "admin@example.com",
          created_at: new Date().toISOString(),
          last_attempt_at: null,
        };
        sends.push(s);
        return { data: [{ send_id: s.id, status: s.status, existing: false }], error: null };
      }
      case "admin_claim_quote_send": {
        const s = sends.find((x) => x.id === a.p_send_id)!;
        const ok = (a.p_mode === "nuevo" && s.status === "pendiente") || (a.p_mode === "reconciliar" && s.status === "incierto");
        if (ok) {
          s.status = "en_proceso";
          s.attempts += 1;
        }
        return { data: [{ claimed: ok, attempts: s.attempts }], error: null };
      }
      case "admin_finish_quote_send": {
        const s = sends.find((x) => x.id === a.p_send_id)!;
        if (s.status !== "en_proceso") return { data: null, error: { code: "RC409" } };
        Object.assign(s, { status: a.p_outcome, provider_id: a.p_provider_id, last_error: a.p_error });
        return { data: a.p_outcome === "aceptado" ? "cambiado" : null, error: null };
      }
      case "admin_resolve_quote_send": {
        const s = sends.find((x) => x.id === a.p_send_id)!;
        if (s.status !== "incierto") return { data: null, error: { code: "RC409" } };
        s.status = a.p_resolution === "aceptado" ? "aceptado" : "fallido";
        return { data: null, error: null };
      }
    }
    return { data: null, error: { code: "unknown" } };
  });

  const client = {
    auth: {
      getClaims: async () => (sub ? { data: { claims: { sub, email: "admin@example.com" } }, error: null } : { data: null, error: null }),
    },
    from,
    rpc,
    storage: {
      from: () => ({
        upload: async (path: string, bytes: Uint8Array) => {
          if (files.has(path)) return { data: null, error: { message: "exists" } };
          files.set(path, new Uint8Array(bytes));
          return { data: { path }, error: null };
        },
        download: async (path: string) => {
          const b = files.get(path);
          return b ? { data: new Blob([new Uint8Array(b)]), error: null } : { data: null, error: { message: "not found" } };
        },
      }),
    },
  };
  return { client, sends, quote, files, rpc, rpcCalls, failures };
}

function fakeResend(responses: SendResult[] = [{ ok: true, id: "re-email-1" }]) {
  const calls: EmailMessage[] = [];
  let i = 0;
  const mailer = {
    send: vi.fn(async (m: EmailMessage) => {
      calls.push(m);
      return responses[Math.min(i++, responses.length - 1)];
    }),
  };
  return { mailer, calls };
}

const settingsWith = (
  mailer: unknown,
  allowlist: string[] | null = ["redcodepr@gmail.com"],
  identity: { from: string; replyTo: string | null } = {
    from: "RedCode Web Design Studio <onboarding@resend.dev>",
    replyTo: "redcodepr@gmail.com",
  }
) => ({ mailer, ownerEmail: "redcodepr@gmail.com", allowlist, ...identity });

const idle = { ok: false, message: null };
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const sendForm = (overrides: Record<string, string> = {}) =>
  form({
    quoteId: QUOTE_ID,
    requestKey: randomUUID(),
    kind: "envio",
    subject: "Cotización COT-TSR0-1QA9",
    body: "Hola, Ana:\n\nAdjunto la cotización.",
    confirm: "si",
    ...overrides,
  });

let db: ReturnType<typeof backend>;
let resend: ReturnType<typeof fakeResend>;
beforeEach(() => {
  db = backend();
  resend = fakeResend();
  env.client = db.client;
  env.settings = settingsWith(resend.mailer);
});

describe("access", () => {
  const calls: [string, () => Promise<unknown>][] = [
    ["finalizeQuote", () => finalizeQuote(idle, form({ requestId: REQUEST_ID, expectedVersion: "4" }))],
    ["generateQuotePdf", () => generateQuotePdf(idle, form({ quoteId: QUOTE_ID }))],
    ["confirmSend", () => confirmSend(idle, sendForm())],
    ["reconcileSend", () => reconcileSend(idle, form({ quoteId: QUOTE_ID, sendId: randomUUID() }))],
    ["resolveSend", () => resolveSend(idle, form({ quoteId: QUOTE_ID, sendId: randomUUID(), resolution: "no_enviado", confirm: "si" }))],
  ];

  it.each(calls)("%s: no session → login, nothing touched", async (_n, call) => {
    db = backend({ sub: null });
    env.client = db.client;
    await expect(call()).rejects.toThrow("REDIRECT:/admin/login");
    expect(db.rpc).not.toHaveBeenCalled();
    expect(resend.mailer.send).not.toHaveBeenCalled();
  });

  it.each(calls)("%s: signed in without admin rights → refused, nothing touched", async (_n, call) => {
    db = backend({ admin: false, sub: "00000000-0000-4000-8000-0000000000b1" });
    env.client = db.client;
    await expect(call()).rejects.toThrow("REDIRECT:/admin/login?error=forbidden");
    expect(db.rpc).not.toHaveBeenCalled();
    expect(resend.mailer.send).not.toHaveBeenCalled();
  });
});

describe("finalize", () => {
  it("refuses an incomplete draft before calling the database, listing the problems", async () => {
    db = backend({ draftComplete: false });
    env.client = db.client;
    const r = await finalizeQuote(idle, form({ requestId: REQUEST_ID, expectedVersion: "4" }));
    expect(r.ok).toBe(false);
    expect(r.problems).toEqual(["Faltan los entregables."]);
    expect(db.rpcCalls).toEqual([]);
  });

  it("refuses a draft version that is no longer current", async () => {
    const r = await finalizeQuote(idle, form({ requestId: REQUEST_ID, expectedVersion: "3" }));
    expect(r.message).toMatch(/cambió desde que lo revisaste/);
    expect(db.rpcCalls).toEqual([]);
  });

  it("finalizes, generates and records the PDF, sends nothing", async () => {
    db = backend({ withPdf: false });
    env.client = db.client;
    await expect(finalizeQuote(idle, form({ requestId: REQUEST_ID, expectedVersion: "4" }))).rejects.toThrow(
      `REDIRECT:/admin/cotizaciones/${QUOTE_ID}`
    );
    expect(db.rpcCalls).toEqual(["admin_finalize_quote", "admin_attach_quote_pdf"]);
    const stored = db.files.get(`${QUOTE_ID}/cotizacion-rev-1.pdf`)!;
    expect(db.quote.pdf_sha256).toBe(sha(stored));
    expect(resend.mailer.send).not.toHaveBeenCalled();
  });

  it("reuses an already stored PDF instead of replacing it", async () => {
    db = backend({ withPdf: false });
    env.client = db.client;
    const earlier = new TextEncoder().encode("%PDF from an interrupted attempt");
    db.files.set(`${QUOTE_ID}/cotizacion-rev-1.pdf`, earlier);
    await generateQuotePdf(idle, form({ quoteId: QUOTE_ID }));
    expect(db.quote.pdf_sha256).toBe(sha(earlier));
  });
});

describe("send", () => {
  it("sends once, with the exact stored PDF, the provider idempotency key and the stored text", async () => {
    const r = await confirmSend(idle, sendForm());
    expect(r).toEqual({ ok: true, message: "Resend aceptó el email. La entrega al buzón no está confirmada." });
    expect(resend.calls).toHaveLength(1);
    const m = resend.calls[0];
    expect(m.to).toBe("redcodepr@gmail.com");
    expect(m.idempotencyKey).toBe(`quote-send/${db.sends[0].id}`);
    expect(m.attachments?.[0].filename).toBe("Cotizacion-COT-TSR0-1QA9-rev1.pdf");
    expect(Buffer.from(m.attachments![0].content, "base64").toString()).toBe("%PDF stored");
    expect(db.sends[0]).toMatchObject({ status: "aceptado", provider_id: "re-email-1", attempts: 1 });
  });

  it("requires the explicit confirmation", async () => {
    const r = await confirmSend(idle, sendForm({ confirm: "" }));
    expect(r.ok).toBe(false);
    expect(db.rpc).not.toHaveBeenCalled();
    expect(resend.mailer.send).not.toHaveBeenCalled();
  });

  it("double click / concurrent submit with the same page key → one email", async () => {
    const fd = sendForm();
    const [a, b] = await Promise.all([confirmSend(idle, fd), confirmSend(idle, fd)]);
    expect(resend.calls).toHaveLength(1);
    expect(db.sends).toHaveLength(1);
    expect([a.ok, b.ok]).toEqual([true, true]);
  });

  it("a reload (new key) after acceptance cannot send the first email again", async () => {
    await confirmSend(idle, sendForm());
    const r = await confirmSend(idle, sendForm());
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/ya se envió/);
    expect(resend.calls).toHaveLength(1);
  });

  it("blocks recipients outside the allowlist before registering anything", async () => {
    env.settings = settingsWith(resend.mailer, ["otra@example.com"]);
    const r = await confirmSend(idle, sendForm());
    expect(r.message).toMatch(/Envío bloqueado: redcodepr@gmail.com no está en la lista/);
    expect(db.rpc).not.toHaveBeenCalled();
    expect(resend.mailer.send).not.toHaveBeenCalled();
  });

  it("failure before calling Resend (stored PDF altered) → fallido, nothing sent", async () => {
    db.files.set(`${QUOTE_ID}/cotizacion-rev-1.pdf`, new TextEncoder().encode("tampered"));
    const r = await confirmSend(idle, sendForm());
    expect(r.ok).toBe(false);
    expect(resend.mailer.send).not.toHaveBeenCalled();
    expect(db.sends[0]).toMatchObject({ status: "fallido", last_error: "pdf_hash_mismatch" });
  });

  it("definite rejection from Resend → fallido", async () => {
    resend = fakeResend([{ ok: false, error: "http_422_validation_error" }]);
    env.settings = settingsWith(resend.mailer);
    const r = await confirmSend(idle, sendForm());
    expect(r.message).toMatch(/no aceptó el envío/);
    expect(db.sends[0].status).toBe("fallido");
  });

  it("timeout → incierto, never retried automatically; reconciling reuses the same key and payload", async () => {
    resend = fakeResend([{ ok: false, error: "timeout" }, { ok: true, id: "re-email-1" }]);
    env.settings = settingsWith(resend.mailer);
    const r = await confirmSend(idle, sendForm());
    expect(r.message).toMatch(/No se sabe si Resend aceptó/);
    expect(resend.calls).toHaveLength(1);
    expect(db.sends[0].status).toBe("incierto");

    // A new send is refused while this one is unresolved.
    expect((await confirmSend(idle, sendForm())).ok).toBe(false);
    expect(resend.calls).toHaveLength(1);

    // Even if the configured sender / Reply-To change before the retry...
    env.settings = settingsWith(resend.mailer, ["redcodepr@gmail.com"], {
      from: "Otro remitente <otro@example.com>",
      replyTo: "otro@example.com",
    });
    const rec = await reconcileSend(idle, form({ quoteId: QUOTE_ID, sendId: db.sends[0].id }));
    expect(rec.ok).toBe(true);
    expect(resend.calls).toHaveLength(2);
    // ...the retry is the identical request: same key, sender, Reply-To, text and PDF → Resend dedupes it.
    expect(resend.calls[1]).toEqual(resend.calls[0]);
    expect(resend.calls[1]).toMatchObject({
      idempotencyKey: `quote-send/${db.sends[0].id}`,
      from: "RedCode Web Design Studio <onboarding@resend.dev>",
      replyTo: "redcodepr@gmail.com",
    });
    expect(db.sends[0]).toMatchObject({ status: "aceptado", attempts: 2 });
  });

  it("uses the configured Reply-To and records sender and Reply-To with the send", async () => {
    await confirmSend(idle, sendForm());
    expect(resend.calls[0]).toMatchObject({
      from: "RedCode Web Design Studio <onboarding@resend.dev>",
      replyTo: "redcodepr@gmail.com",
    });
    expect(db.sends[0]).toMatchObject({
      sender: "RedCode Web Design Studio <onboarding@resend.dev>",
      reply_to: "redcodepr@gmail.com",
    });
  });

  it("omits Reply-To when none is configured", async () => {
    env.settings = settingsWith(resend.mailer, ["redcodepr@gmail.com"], {
      from: "RedCode Web Design Studio <onboarding@resend.dev>",
      replyTo: null,
    });
    await confirmSend(idle, sendForm());
    expect(resend.calls[0].replyTo).toBeUndefined();
  });

  it("repeating with the same key is refused outside the safe window, without calling Resend", async () => {
    resend = fakeResend([{ ok: false, error: "timeout" }]);
    env.settings = settingsWith(resend.mailer);
    await confirmSend(idle, sendForm());
    // The database refuses the claim after 23 h (RC409; checked live in supabase/tests/quote_sending.sql).
    db.failures.admin_claim_quote_send = { code: "RC409" };
    const r = await reconcileSend(idle, form({ quoteId: QUOTE_ID, sendId: db.sends[0].id }));
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/más de 23 horas/);
    expect(resend.calls).toHaveLength(1);
  });

  it("Resend accepted but recording failed → keeps it in progress and asks to reconcile, no resend", async () => {
    db.failures.admin_finish_quote_send = { code: "08006" };
    const r = await confirmSend(idle, sendForm());
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/No vuelvas a enviar/);
    expect(resend.calls).toHaveLength(1);
    expect(db.sends[0].status).toBe("en_proceso");
  });

  it("manual resolution records the outcome without calling Resend", async () => {
    resend = fakeResend([{ ok: false, error: "network_error" }]);
    env.settings = settingsWith(resend.mailer);
    await confirmSend(idle, sendForm());
    const bad = await resolveSend(idle, form({ quoteId: QUOTE_ID, sendId: db.sends[0].id, resolution: "aceptado", confirm: "si" }));
    expect(bad.ok).toBe(false); // the Resend email ID is required
    const r = await resolveSend(
      idle,
      form({ quoteId: QUOTE_ID, sendId: db.sends[0].id, resolution: "aceptado", providerId: "abc-123", confirm: "si" })
    );
    expect(r.ok).toBe(true);
    expect(resend.calls).toHaveLength(1);
  });

  it("validates subject and body; the recipient cannot be supplied", async () => {
    const r = await confirmSend(idle, sendForm({ subject: " ", body: "x".repeat(5001), to: "otra@example.com" }));
    expect(r.ok).toBe(false);
    expect(r.problems).toEqual(["Escribe el asunto.", "Mensaje: máximo 5000 caracteres."]);
    await confirmSend(idle, sendForm({ to: "otra@example.com" }));
    expect(resend.calls[0].to).toBe("redcodepr@gmail.com");
  });
});
