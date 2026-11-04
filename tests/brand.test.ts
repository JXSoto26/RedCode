import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { quoteDocDefinition } from "@/lib/admin/quote-pdf";
import { defaultQuoteEmail } from "@/lib/admin/quote-send";
import { ownerNotificationEmail, visitorConfirmationEmail } from "@/lib/quote/emails";
import { parseQuoteRequest } from "@/lib/quote/schema";
import { site } from "@/lib/site";
import { NOW, validValues } from "./quote/fixtures";

/**
 * The studio is presented only as "RedCode Web Design Studio": no personal
 * name in pages, metadata, emails or new PDFs. Private panel data (accounts,
 * audit history) is not source code and is not affected.
 */
const PERSONAL = /jeremy|\bsoto\b|\bflores\b/i;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(tsx?|css|json|md|txt|svg)$/.test(name) ? [path] : [];
  });
}

describe("brand-only identity", () => {
  it("has no personal name in the shared site config", () => {
    expect(Object.keys(site)).not.toContain("owner");
    expect(JSON.stringify(site)).not.toMatch(PERSONAL);
  });

  it("has no personal name anywhere in the app source or public assets", () => {
    const files = ["app", "components", "lib", "public"].flatMap(sources);
    expect(files.length).toBeGreaterThan(20);
    const hits = files.filter((f) => PERSONAL.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });

  it("signs new emails with the brand only", () => {
    const parsed = parseQuoteRequest(validValues({ contactName: "Ana", businessName: "Panadería Ñ" }), NOW);
    if (!parsed.success) throw new Error("fixture should be valid");
    const data = parsed.data;
    const visitor = visitorConfirmationEmail("RC-ABCD-EFGH", data, true);
    const owner = ownerNotificationEmail("RC-ABCD-EFGH", data);
    const quote = defaultQuoteEmail({ quoteReference: "COT-ABCD-EFGH", revision: 1, businessName: "Panadería Ñ", contactName: "Ana" }, true);
    for (const text of [visitor.subject, visitor.text, visitor.html, owner.text, owner.html, quote.subject, quote.body]) {
      expect(text).not.toMatch(PERSONAL);
    }
    expect(visitor.text).toContain(`${site.name} · ${site.location}`);
    expect(quote.body.endsWith(site.name)).toBe(true);
  });

  it("shows only the brand as the studio's identity on new PDFs", () => {
    const doc = JSON.stringify(
      quoteDocDefinition({
        quoteReference: "COT-ABCD-EFGH",
        revision: 1,
        issuedAt: "2026-11-03T12:00:00Z",
        businessName: "Panadería Ñ",
        contactName: "Ana",
        title: "Página informativa",
        summary: "Resumen",
        deliverables: "Inicio",
        exclusions: null,
        estimatedTime: null,
        terms: null,
        validity: null,
        currency: "USD",
        totalCents: 10000,
        items: [{ description: "Diseño", quantityHundredths: 100, unitPriceCents: 10000, lineTotalCents: 10000 }],
      })
    );
    expect(doc).not.toMatch(PERSONAL);
    expect(doc).toContain("Code Web Design Studio");
    expect(doc).toContain(`Estudio de diseño web · ${site.location}`);
  });
});
