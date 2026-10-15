import { describe, expect, it } from "vitest";
import type { StoredDraft } from "@/lib/admin/draft";
import {
  classifySendResult,
  defaultQuoteEmail,
  finalizeProblems,
  oneLine,
  pdfFilename,
  quoteEmailHtml,
  recipientAllowed,
} from "@/lib/admin/quote-send";

const draft = (overrides: Partial<StoredDraft> = {}): StoredDraft => ({
  id: "d",
  version: 3,
  title: "Página informativa",
  summary: "Alcance",
  deliverables: "Página",
  exclusions: null,
  estimatedTime: null,
  terms: null,
  validity: null,
  updatedAt: "2026-10-15T00:00:00Z",
  items: [{ id: "i", description: "Diseño", quantityHundredths: 100, unitPriceCents: 50000 }],
  ...overrides,
});

describe("finalizeProblems", () => {
  it("accepts a complete draft; exclusions, time, terms and validity are optional", () => {
    expect(finalizeProblems(draft())).toEqual([]);
  });

  it("lists every missing required part", () => {
    expect(finalizeProblems(null)).toEqual(["Todavía no hay un borrador guardado."]);
    expect(finalizeProblems(draft({ title: null, summary: null, deliverables: null, items: [] }))).toEqual([
      "Falta el título.",
      "Falta el resumen y alcance.",
      "Faltan los entregables.",
      "Añade al menos una partida.",
    ]);
  });

  it("rejects incomplete items and a zero total", () => {
    expect(
      finalizeProblems(draft({ items: [{ id: "i", description: null, quantityHundredths: 100, unitPriceCents: null }] }))
    ).toEqual(["Partida 1: falta descripción, precio."]);
    expect(
      finalizeProblems(draft({ items: [{ id: "i", description: "Gratis", quantityHundredths: 100, unitPriceCents: 0 }] }))
    ).toEqual(["El total debe ser mayor que $0.00."]);
  });
});

describe("classifySendResult", () => {
  it("only an ID from Resend counts as accepted", () => {
    expect(classifySendResult({ ok: true, id: "4ef9a417-02e9" })).toEqual({ outcome: "aceptado", providerId: "4ef9a417-02e9", error: null });
    expect(classifySendResult({ ok: true, id: null }).outcome).toBe("incierto");
  });

  it("treats anything where Resend may have accepted it as uncertain", () => {
    for (const error of ["timeout", "network_error", "http_500_error", "http_503_error", "http_409_concurrent_idempotent_requests", "http_409_invalid_idempotent_request"]) {
      expect(classifySendResult({ ok: false, error }).outcome, error).toBe("incierto");
    }
  });

  it("treats a definite rejection as failed (nothing was sent)", () => {
    for (const error of ["http_400_validation_error", "http_403_validation_error", "http_422_invalid_attachment", "http_429_rate_limit_exceeded"]) {
      expect(classifySendResult({ ok: false, error }).outcome, error).toBe("fallido");
    }
  });
});

describe("delivery and email content", () => {
  it("respects the allowlist (null = deliver to all)", () => {
    expect(recipientAllowed("RedCodePR@gmail.com ", ["redcodepr@gmail.com"])).toBe(true);
    expect(recipientAllowed("otra@example.com", ["redcodepr@gmail.com"])).toBe(false);
    expect(recipientAllowed("otra@example.com", [])).toBe(false);
    expect(recipientAllowed("otra@example.com", null)).toBe(true);
  });

  it("drafts a neutral email without commercial terms", () => {
    const q = { quoteReference: "COT-ABCD-EFGH", revision: 2, businessName: "Panadería Ñ", contactName: "Ana" };
    const { subject, body } = defaultQuoteEmail(q, false);
    expect(subject).toBe("Cotización COT-ABCD-EFGH · RedCode Web Design Studio");
    expect(body).toContain("Hola, Ana:");
    expect(body).toContain("COT-ABCD-EFGH (revisión 2) para Panadería Ñ");
    expect(body).not.toMatch(/responder/);
    expect(body).not.toMatch(/\b(factura|impuestos?|IVA|depósito|pago)\b/i);
    expect(defaultQuoteEmail(q, true).body).toMatch(/responder a este email/);
  });

  it("escapes HTML and keeps paragraphs; subjects are one line", () => {
    const html = quoteEmailHtml("Hola <b>Ana</b> & co:\nlínea 2\n\nOtro párrafo");
    expect(html).toContain("Hola &lt;b&gt;Ana&lt;/b&gt; &amp; co:<br>línea 2</p>");
    expect(html).toContain(">Otro párrafo</p>");
    expect(oneLine("Asunto\r\nBcc: x@y.com")).toBe("Asunto Bcc: x@y.com");
    expect(pdfFilename("COT-ABCD-EFGH", 3)).toBe("Cotizacion-COT-ABCD-EFGH-rev3.pdf");
  });
});
