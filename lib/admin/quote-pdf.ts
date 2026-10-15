import "server-only";
import { createRequire } from "node:module";
import { site } from "@/lib/site";
import { formatCents, hundredthsToDecimal } from "./money";

/**
 * Server-side PDF for a finalized quote revision (pdfmake: pure JavaScript,
 * no browser). Fonts are embedded from pdfmake's bundled Roboto (full Latin
 * coverage: tildes, ñ, ¿, ¡), loaded from memory — nothing is read from disk
 * or the network at render time.
 */

export type QuoteForPdf = {
  quoteReference: string;
  revision: number;
  issuedAt: string;
  businessName: string;
  contactName: string;
  title: string;
  summary: string;
  deliverables: string;
  exclusions: string | null;
  estimatedTime: string | null;
  terms: string | null;
  validity: string | null;
  currency: "USD";
  totalCents: number;
  items: { description: string; quantityHundredths: number; unitPriceCents: number; lineTotalCents: number }[];
};

const BRAND = "#d20e1c";
const INK = "#18181b";
const MUTED = "#71717a";
const RULE = "#e4e4e7";

const longDate = new Intl.DateTimeFormat("es-PR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Puerto_Rico",
});

const lines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^[-•*]\s*/, ""))
    .filter(Boolean);

const quantity = (hundredths: number) => hundredthsToDecimal(hundredths).replace(/\.00$/, "");

/** Builds the pdfmake document definition. Pure, so it can be tested. */
export function quoteDocDefinition(q: QuoteForPdf) {
  // headlineLevel lets pageBreakBefore keep a heading with the text after it.
  const heading = (text: string) => ({
    text: text.toUpperCase(),
    style: "heading",
    headlineLevel: 1,
  });
  const section = (title: string, body: unknown) => ({
    stack: [heading(title), body],
    margin: [0, 18, 0, 0],
  });
  const paragraph = (text: string) => ({ text, style: "body" });
  const list = (text: string) => ({ ul: lines(text), style: "body", markerColor: BRAND });

  const contact = [site.contact.email, site.contact.whatsapp ? `+${site.contact.whatsapp}` : null]
    .filter(Boolean)
    .join(" · ");

  const content: unknown[] = [
    {
      columns: [
        {
          width: "*",
          stack: [
            {
              text: [
                { text: "Red", color: BRAND },
                { text: "Code Web Design Studio", color: INK },
              ],
              fontSize: 16,
              bold: true,
            },
            { text: `${site.owner} · ${site.location}`, color: MUTED, fontSize: 9.5, margin: [0, 3, 0, 0] },
            ...(contact ? [{ text: contact, color: MUTED, fontSize: 9.5 }] : []),
          ],
        },
        {
          width: "auto",
          stack: [
            { text: "Cotización", fontSize: 20, bold: true, color: BRAND, alignment: "right" },
            { text: q.quoteReference, alignment: "right", fontSize: 10, margin: [0, 4, 0, 0] },
            { text: `Revisión ${q.revision}`, alignment: "right", fontSize: 9.5, color: MUTED },
            { text: longDate.format(new Date(q.issuedAt)), alignment: "right", fontSize: 9.5, color: MUTED },
          ],
        },
      ],
    },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: RULE }], margin: [0, 16, 0, 0] },
    {
      margin: [0, 16, 0, 0],
      stack: [
        { text: "PREPARADA PARA", style: "heading" },
        { text: q.businessName, bold: true, fontSize: 11.5 },
        { text: q.contactName, color: MUTED },
      ],
    },
    { text: q.title, style: "title", margin: [0, 22, 0, 0] },
    section("Alcance", paragraph(q.summary)),
    section("Entregables", list(q.deliverables)),
  ];

  if (q.exclusions) content.push(section("Exclusiones", list(q.exclusions)));

  content.push(
    {
      margin: [0, 18, 0, 0],
      table: {
        // The section title is a header row: it repeats on every page and
        // never ends up alone at the bottom of a page.
        headerRows: 2,
        dontBreakRows: true,
        keepWithHeaderRows: 1,
        widths: ["*", 48, 92, 92],
        body: [
          [{ text: "INVERSIÓN", style: "heading", colSpan: 4 }, {}, {}, {}],
          [
            { text: "Descripción", style: "th" },
            { text: "Cant.", style: "th", alignment: "right" },
            { text: "Precio unitario", style: "th", alignment: "right" },
            { text: "Importe", style: "th", alignment: "right" },
          ],
          ...q.items.map((item) => [
            { text: item.description, style: "td" },
            { text: quantity(item.quantityHundredths), style: "td", alignment: "right" },
            { text: formatCents(item.unitPriceCents), style: "td", alignment: "right" },
            { text: formatCents(item.lineTotalCents), style: "td", alignment: "right" },
          ]),
          // The total is the table's last row, so it is never detached from
          // it: on a new page it appears under the repeated headers.
          [
            { text: `Total (${q.currency})`, bold: true, colSpan: 3, alignment: "right", margin: [0, 3, 0, 0] },
            {},
            {},
            { text: formatCents(q.totalCents), bold: true, fontSize: 14, alignment: "right" },
          ],
        ],
      },
      layout: {
        hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
          i < 2 || i === node.table.body.length ? 0 : i === 2 || i === node.table.body.length - 1 ? 1.2 : 0.6,
        vLineWidth: () => 0,
        hLineColor: (i: number) => (i === 2 ? "#a1a1aa" : i > 2 ? RULE : "#a1a1aa"),
        paddingLeft: () => 0,
        paddingRight: (i: number, node: { table: { widths: unknown[] } }) => (i === node.table.widths.length - 1 ? 0 : 8),
        paddingTop: (i: number) => (i === 0 ? 0 : 6),
        paddingBottom: (i: number) => (i === 0 ? 0 : 6),
      },
    },
    { text: "Importes en dólares estadounidenses (USD).", fontSize: 8.5, color: MUTED, alignment: "right", margin: [0, 4, 0, 0] }
  );

  if (q.estimatedTime) content.push(section("Tiempo estimado", paragraph(q.estimatedTime)));
  if (q.terms) content.push(section("Condiciones", paragraph(q.terms)));
  if (q.validity) content.push(section("Vigencia", paragraph(q.validity)));

  return {
    pageSize: "LETTER",
    pageMargins: [48, 48, 48, 56],
    info: {
      title: `Cotización ${q.quoteReference} (revisión ${q.revision})`,
      author: site.name,
      creator: site.name,
      producer: site.name,
    },
    language: "es",
    defaultStyle: { font: "Roboto", fontSize: 10.5, color: INK, lineHeight: 1.3 },
    styles: {
      heading: { fontSize: 8.5, bold: true, color: MUTED, characterSpacing: 0.8, margin: [0, 0, 0, 5] },
      title: { fontSize: 18, bold: true, color: INK },
      body: { fontSize: 10.5 },
      th: { fontSize: 8.5, bold: true, color: MUTED },
      td: { fontSize: 10 },
    },
    pageBreakBefore: (node: { headlineLevel?: number }, ctx: { getFollowingNodesOnPage(): unknown[] }) =>
      node.headlineLevel === 1 && ctx.getFollowingNodesOnPage().length === 0,
    footer: (current: number, total: number) => ({
      margin: [48, 18, 48, 0],
      columns: [
        { text: `${site.name} · ${q.quoteReference} · Revisión ${q.revision}`, fontSize: 8, color: MUTED },
        { text: `Página ${current} de ${total}`, fontSize: 8, color: MUTED, alignment: "right" },
      ],
    }),
    content,
  };
}

/** Readable stand-ins for common symbols the embedded font cannot draw. */
const FALLBACKS: Record<string, string> = {
  "→": "->",
  "⟶": "->",
  "⇒": "=>",
  "←": "<-",
  "⇐": "<=",
  "↔": "<->",
  "✓": "•",
  "✔": "•",
  "☑": "•",
  "✗": "x",
  "✘": "x",
  "★": "*",
  "☆": "*",
};

/**
 * Replaces characters the embedded font has no glyph for (they would print as
 * empty boxes): known symbols get a readable fallback, anything else (e.g.
 * emoji) is dropped. Spanish letters and usual punctuation are all covered.
 */
export function pdfSafeText(text: string, hasGlyph: (codePoint: number) => boolean): string {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    const cp = ch.codePointAt(0)!;
    if (ch === "\n" || ch === "\t" || hasGlyph(cp)) out += ch;
    else if (FALLBACKS[ch]) out += FALLBACKS[ch];
    else if (/\s/.test(ch)) out += " ";
  }
  return out.replace(/[ \t]{2,}/g, " ");
}

type PdfMake = {
  virtualfs: { writeFileSync(name: string, data: Buffer): void };
  setFonts(fonts: Record<string, Record<string, string>>): void;
  setUrlAccessPolicy(cb: (url: string) => boolean): void;
  setLocalAccessPolicy(cb: (path: string) => boolean): void;
  createPdf(doc: unknown): { getBuffer(): Promise<Buffer> };
};

type Engine = { pdfmake: PdfMake; hasGlyph: (codePoint: number) => boolean };
let engine: Engine | null = null;

function pdfEngine(): Engine {
  if (engine) return engine;
  const require = createRequire(import.meta.url);
  const pdfmake = require("pdfmake") as PdfMake;
  const fontkit = require("fontkit") as { create(buffer: Buffer): { hasGlyphForCodePoint(cp: number): boolean } };
  const vfs = require("pdfmake/build/vfs_fonts.js") as Record<string, string>;
  for (const name of ["Roboto-Regular.ttf", "Roboto-Medium.ttf", "Roboto-Italic.ttf", "Roboto-MediumItalic.ttf"]) {
    pdfmake.virtualfs.writeFileSync(name, Buffer.from(vfs[name], "base64"));
  }
  // Text is drawn in Regular and Medium (bold): a glyph must exist in both.
  const regular = fontkit.create(Buffer.from(vfs["Roboto-Regular.ttf"], "base64"));
  const medium = fontkit.create(Buffer.from(vfs["Roboto-Medium.ttf"], "base64"));
  const hasGlyph = (cp: number) => regular.hasGlyphForCodePoint(cp) && medium.hasGlyphForCodePoint(cp);
  pdfmake.setFonts({
    Roboto: {
      normal: "Roboto-Regular.ttf",
      bold: "Roboto-Medium.ttf",
      italics: "Roboto-Italic.ttf",
      bolditalics: "Roboto-MediumItalic.ttf",
    },
  });
  // Quote content is user-provided: never fetch URLs or read local files.
  pdfmake.setUrlAccessPolicy(() => false);
  pdfmake.setLocalAccessPolicy(() => false);
  engine = { pdfmake, hasGlyph };
  return engine;
}

export async function renderQuotePdf(q: QuoteForPdf): Promise<Buffer> {
  const { pdfmake, hasGlyph } = pdfEngine();
  const safe = (s: string) => pdfSafeText(s, hasGlyph);
  const opt = (s: string | null) => (s === null ? null : safe(s));
  const clean: QuoteForPdf = {
    ...q,
    businessName: safe(q.businessName),
    contactName: safe(q.contactName),
    title: safe(q.title),
    summary: safe(q.summary),
    deliverables: safe(q.deliverables),
    exclusions: opt(q.exclusions),
    estimatedTime: opt(q.estimatedTime),
    terms: opt(q.terms),
    validity: opt(q.validity),
    items: q.items.map((i) => ({ ...i, description: safe(i.description) })),
  };
  return pdfmake.createPdf(quoteDocDefinition(clean)).getBuffer();
}

/** Glyph coverage of the embedded font (for tests). */
export function pdfFontHasGlyph(codePoint: number) {
  return pdfEngine().hasGlyph(codePoint);
}
