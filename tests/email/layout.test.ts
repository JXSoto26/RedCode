import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { quoteEmailHtml } from "@/lib/admin/quote-send";
import { CURRENT_EMAIL_TEMPLATE, EMAIL_LOGO, emailTemplateOf } from "@/lib/email/layout";
import { ownerNotificationEmail, render, visitorConfirmationEmail } from "@/lib/quote/emails";
import { parseQuoteRequest } from "@/lib/quote/schema";
import { site } from "@/lib/site";
import { NOW, validValues } from "../quote/fixtures";
import { legacyQuoteEmailHtml, legacyRender } from "./legacy-v1";

const parsed = parseQuoteRequest(validValues({ contactName: "Ana <b>", businessName: "Panadería & Co" }), NOW);
if (!parsed.success) throw new Error("fixture");
const data = parsed.data;
const BODY = "Hola, Ana:\n\nTe enviamos la cotización COT-ABCD-EFGH.\nLínea 2 <b>\n\nRedCode Web Design Studio";

describe("email template version 1 (stored on earlier requests and sends)", () => {
  it("renders the exact HTML of the original design, so retries repeat the same request", () => {
    const intro = ["Hola, Ana:", "Intro <con> & símbolos"];
    const rows: [string, string][] = [["Referencia", "RC-ABCD-EFGH"], ["Notas", "línea 1\nlínea 2"]];
    const outro = ["Nota final."];
    expect(render(intro, rows, outro, 1).html).toBe(legacyRender(intro, rows, outro).html);
    expect(render(intro, rows, outro, 1, { signature: "Firma" }).html).toBe(legacyRender(intro, rows, [...outro, "Firma"]).html);
    expect(render(intro, rows, outro, 1, { signature: "Firma" }).text).toBe(legacyRender(intro, rows, [...outro, "Firma"]).text);
    expect(quoteEmailHtml(BODY, 1)).toBe(legacyQuoteEmailHtml(BODY));
  });

  it("keeps the original confirmation and internal notice builders", () => {
    const visitor = visitorConfirmationEmail("RC-ABCD-EFGH", data, true, 1);
    const legacyVisitor = legacyRender(
      [`Hola, ${data.contactName}:`, `Recibimos tu solicitud de cotización en ${site.name}. Este es un resumen breve de lo que enviaste.`],
      [
        ["Referencia", "RC-ABCD-EFGH"],
        ["Negocio u organización", data.businessName],
        ["Servicio", "Página informativa"],
        ["Objetivo principal", data.goal],
      ],
      [
        "Este mensaje solo confirma que recibimos tu solicitud. No constituye una cotización ni reserva una fecha.",
        "Si quieres añadir información, puedes responder a este email.",
        `${site.name} · ${site.location}`,
      ]
    );
    expect(visitor.html).toBe(legacyVisitor.html);
    expect(visitor.text).toBe(legacyVisitor.text);
    expect(ownerNotificationEmail("RC-ABCD-EFGH", data, 1).html).not.toContain("<img");
  });

  it("treats rows without a stored version as version 1", () => {
    expect(emailTemplateOf(undefined)).toBe(1);
    expect(emailTemplateOf(null)).toBe(1);
    expect(emailTemplateOf(1)).toBe(1);
    expect(emailTemplateOf(2)).toBe(2);
    expect(CURRENT_EMAIL_TEMPLATE).toBe(2);
  });
});

describe("email template version 2 (branded header)", () => {
  const all = {
    confirmation: visitorConfirmationEmail("RC-ABCD-EFGH", data, true, 2).html,
    notice: ownerNotificationEmail("RC-ABCD-EFGH", data, 2).html,
    quote: quoteEmailHtml(BODY, 2),
  };

  it.each(Object.entries(all))("%s: logo from the own domain, fixed size, alt text and a text brand", (_name, html) => {
    expect(EMAIL_LOGO.url).toBe("https://redcodewebdesign.com/email/redcode-logo-v1.png");
    const img = /<img [^>]+>/.exec(html)![0];
    expect(img).toContain(`src="${EMAIL_LOGO.url}"`);
    expect(img).toContain('width="220"');
    expect(img).toContain('height="35"');
    expect(img).toContain('alt="RedCode Web Design Studio"');
    expect(html.match(/<img /g)).toHaveLength(1);
    // White header for legibility; the brand is still named in text if images are blocked.
    expect(html).toContain("background-color:#ffffff;border-bottom:3px solid #d20e1c");
    expect(html).toContain(`${site.name} · ${site.location} · <a href="https://redcodewebdesign.com"`);
    expect(html).not.toMatch(/cloudflare|vercel\.app|localhost|supabase\.co/i);
  });

  it("still escapes the content", () => {
    expect(all.confirmation).toContain("Hola, Ana &lt;b&gt;:");
    expect(all.quote).toContain("Línea 2 &lt;b&gt;</p>");
    expect(all.confirmation).not.toContain("<b>");
  });

  it("keeps the plain-text part (and its signature) unchanged", () => {
    expect(visitorConfirmationEmail("RC-ABCD-EFGH", data, true, 2).text).toBe(visitorConfirmationEmail("RC-ABCD-EFGH", data, true, 1).text);
  });
});

describe("email logo asset", () => {
  it("is a 440×70 opaque PNG under 50 KB, shown at half size", () => {
    const png = readFileSync("public/email/redcode-logo-v1.png");
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(440); // IHDR width
    expect(png.readUInt32BE(20)).toBe(70); // IHDR height
    expect([2, 3]).toContain(png[25]); // colour type: RGB or palette (no alpha channel)
    expect(png.length).toBeLessThan(50_000);
    expect(440 / 70).toBe(EMAIL_LOGO.width * 2 / (EMAIL_LOGO.height * 2));
  });
});

describe("email template migration", () => {
  it("keeps existing rows on version 1 and gives new rows version 2, adding columns only", () => {
    const file = readdirSync("supabase/migrations").find((f) => f.endsWith("_email_template_version.sql"))!;
    // Git may check SQL out with CRLF on Windows: compare with LF line endings.
    const sql = readFileSync(`supabase/migrations/${file}`, "utf8").replace(/\r\n/g, "\n").replace(/--[^\n]*/g, "").toLowerCase();
    for (const table of ["quote_requests", "quote_sends"]) {
      expect(sql).toContain(`alter table public.${table}\n  add column email_template smallint not null default 1`);
      expect(sql).toContain(`alter table public.${table} alter column email_template set default 2;`);
    }
    expect(sql).not.toMatch(/\b(update|delete|drop|grant|revoke|create (or replace )?function)\b/);
  });
});
