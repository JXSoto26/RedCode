import { describe, expect, it } from "vitest";
import { pdfFontHasGlyph, pdfSafeText, quoteDocDefinition, renderQuotePdf, type QuoteForPdf } from "@/lib/admin/quote-pdf";

const base: QuoteForPdf = {
  quoteReference: "COT-ABCD-EFGH",
  revision: 2,
  issuedAt: "2026-10-15T16:45:00Z",
  businessName: "Panadería Doña Ñeca",
  contactName: "María Núñez",
  title: "Página informativa",
  summary: "¿Alcance? Sí: diseño y desarrollo. ¡Listo!",
  deliverables: "Inicio\n- Menú\n• Contacto",
  exclusions: null,
  estimatedTime: null,
  terms: null,
  validity: null,
  currency: "USD",
  totalCents: 126000,
  items: [
    { description: "Diseño", quantityHundredths: 100, unitPriceCents: 120000, lineTotalCents: 120000 },
    { description: "Formulario", quantityHundredths: 150, unitPriceCents: 4000, lineTotalCents: 6000 },
  ],
};

const textOf = (doc: unknown) => JSON.stringify(doc);
const pages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type \/Page[^s]/g) ?? []).length;

describe("quote PDF content", () => {
  it("is a finalized quote: 'Cotización', reference, revision, no draft mark, no internal ids or URLs", () => {
    const doc = quoteDocDefinition(base);
    const text = textOf(doc);
    expect(text).toContain("Cotización");
    expect(text).toContain("COT-ABCD-EFGH");
    expect(text).toContain("Revisión 2");
    expect(text).toContain("15 de octubre de 2026");
    expect(text).not.toMatch(/BORRADOR|borrador/);
    expect(text).not.toMatch(/https?:\/\/|\/admin\//);
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/); // no UUIDs
    expect(text).not.toMatch(/\b(factura|impuestos?|IVA|depósito)\b/i);
  });

  it("shows optional sections only when defined", () => {
    const text = textOf(quoteDocDefinition(base));
    for (const heading of ["EXCLUSIONES", "TIEMPO ESTIMADO", "CONDICIONES", "VIGENCIA"]) expect(text).not.toContain(heading);
    const full = textOf(
      quoteDocDefinition({ ...base, exclusions: "Textos", estimatedTime: "3 semanas", terms: "Condición", validity: "30 días" })
    );
    for (const heading of ["EXCLUSIONES", "TIEMPO ESTIMADO", "CONDICIONES", "VIGENCIA"]) expect(full).toContain(heading);
  });

  it("lists items with server totals and repeats table headers across pages", () => {
    const doc = quoteDocDefinition(base) as unknown as { content: { table?: { headerRows: number; dontBreakRows: boolean; body: unknown[] } }[] };
    const table = doc.content.find((c) => c.table)!.table!;
    expect(table.headerRows).toBe(2);
    expect(table.dontBreakRows).toBe(true);
    const text = textOf(table.body);
    expect(text).toContain("$1,200.00");
    expect(text).toContain("1.50");
    expect(text).toContain("$60.00");
    expect(text).toContain("$1,260.00");
    expect(textOf(quoteDocDefinition(base))).toContain('"ul":["Inicio","Menú","Contacto"]');
  });
});

describe("characters the embedded font cannot draw", () => {
  it("keeps all Spanish text and usual punctuation", () => {
    const spanish = "¿Año? ¡Sí! Ñandú, acción, pingüino — “comillas” ‘simples’ … 20 € · 15° ± 2 × 3 ÷ 4 © ®";
    expect(pdfSafeText(spanish, pdfFontHasGlyph)).toBe(spanish);
  });

  it("replaces symbols with readable fallbacks and drops the rest (no empty boxes)", () => {
    expect(pdfSafeText("Diseño → desarrollo ✓ listo 🚀 ★", pdfFontHasGlyph)).toBe("Diseño -> desarrollo • listo *");
    expect(pdfSafeText("línea 1\nlínea 2", pdfFontHasGlyph)).toBe("línea 1\nlínea 2");
  });
});

describe("quote PDF rendering", () => {
  it("renders a real one-page PDF with embedded fonts", async () => {
    const pdf = await renderQuotePdf(base);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pages(pdf)).toBe(1);
    expect(pdf.toString("latin1")).toMatch(/FontFile2/); // embedded TrueType (Roboto): tildes and ñ
  });

  it("flows long content onto several pages", async () => {
    const items = Array.from({ length: 40 }, (_, i) => ({
      description: `Partida ${i + 1}: descripción larga con acentos y ñ para forzar varias líneas dentro de la celda de la tabla.`,
      quantityHundredths: 100,
      unitPriceCents: 1000,
      lineTotalCents: 1000,
    }));
    const pdf = await renderQuotePdf({ ...base, items, totalCents: 40000, terms: "Condición larga. ".repeat(200) });
    expect(pages(pdf)).toBeGreaterThan(2);
  });
});
