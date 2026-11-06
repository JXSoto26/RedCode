import { CURRENT_EMAIL_TEMPLATE, emailDocument, type EmailTemplate } from "@/lib/email/layout";
import { site } from "@/lib/site";
import {
  ASSET_STATUSES,
  ASSETS,
  BUSINESS_TYPES,
  FEATURES,
  SECTIONS,
  SERVICES,
  labelFor,
} from "./options";
import type { QuoteRequestData } from "./schema";

type Row = [label: string, value: string];

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Subjects are single-line; strip anything that could break headers. */
const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, " ").trim().slice(0, 150);

export function businessTypeLabel(d: QuoteRequestData) {
  return d.businessType === "otro" && d.businessTypeOther
    ? `Otro: ${d.businessTypeOther}`
    : labelFor(BUSINESS_TYPES, d.businessType);
}

function listLabel(
  list: readonly { value: string; label: string }[],
  selected: string[],
  other: string | null
) {
  if (selected.length === 0) return "Sin especificar";
  return selected
    .map((v) => (v === "otra" && other ? `Otra: ${other}` : labelFor(list, v)))
    .join(", ");
}

export function budgetLabel(d: QuoteRequestData) {
  if (d.budgetUndefined) return "No lo tengo definido";
  if (d.budgetUsd === null) return "Sin especificar";
  return `$${d.budgetUsd.toLocaleString("en-US")} USD (aproximado)`;
}

export function dateLabel(d: QuoteRequestData) {
  if (d.dateUndefined) return "No tengo una fecha definida";
  return d.desiredDate ?? "Sin especificar";
}

/** Every field, in form order. Used for the internal notification. */
export function fullSummaryRows(d: QuoteRequestData): Row[] {
  const rows: Row[] = [
    ["Contacto", d.contactName],
    ["Negocio u organización", d.businessName],
    ["Email", d.email],
    ["WhatsApp", d.whatsapp ?? "No indicado"],
    ["Tipo de negocio", businessTypeLabel(d)],
    ["Servicio", labelFor(SERVICES, d.service)],
    ["Objetivo principal", d.goal],
    ["Página actual", d.currentUrl ?? "No indicada"],
  ];
  if (d.service === "rediseno") rows.push(["Qué quiere mejorar", d.redesignImprovements ?? ""]);
  rows.push(
    ["Secciones", listLabel(SECTIONS, d.sections, d.sectionsOther)],
    ["Funciones por evaluar", listLabel(FEATURES, d.features, d.featuresOther)],
    ...ASSETS.map(({ field, label }): Row => [label, labelFor(ASSET_STATUSES, d[field])]),
    ["Presupuesto", budgetLabel(d)],
    ["Fecha deseada", dateLabel(d)],
    ["Comentarios", d.comments ?? "Ninguno"]
  );
  return rows;
}

const LEGACY_BODY_STYLE =
  "font-family:Arial,Helvetica,sans-serif;color:#18181b;line-height:1.5;max-width:600px;margin:0 auto;padding:16px";

/**
 * Plain text and HTML of a notification. The signature is part of the text and
 * of the version-1 HTML; version 2 shows the brand in its own header and footer.
 * `logoUrl` is only for local previews.
 */
export function render(
  intro: string[],
  rows: Row[],
  outro: string[],
  template: EmailTemplate,
  opts: { signature?: string; logoUrl?: string } = {}
) {
  const fullOutro = opts.signature ? [...outro, opts.signature] : outro;
  const text = [
    ...intro,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    ...fullOutro,
  ].join("\n");

  const branded = template === 2;
  const htmlOutro = branded ? outro : fullOutro;
  const inner = `${intro.map((p) => (branded ? `<p style="margin:0 0 12px">${escapeHtml(p)}</p>` : `<p>${escapeHtml(p)}</p>`)).join("\n")}
<table role="presentation" style="border-collapse:collapse;width:100%;margin:16px 0">
${rows
  .map(
    ([k, v]) =>
      `<tr><th scope="row" style="text-align:left;vertical-align:top;padding:6px 12px 6px 0;border-bottom:1px solid #e4e4e7;white-space:nowrap">${escapeHtml(k)}</th><td style="padding:6px 0;border-bottom:1px solid #e4e4e7;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`
  )
  .join("\n")}
</table>
${htmlOutro.map((p) => `<p style="color:#52525b;font-size:14px">${escapeHtml(p)}</p>`).join("\n")}`;

  const html = emailDocument(inner, template, {
    legacyBodyStyle: LEGACY_BODY_STYLE,
    lineHeight: "1.5",
    logoUrl: opts.logoUrl,
  });
  return { text, html };
}

export function visitorConfirmationEmail(
  reference: string,
  d: QuoteRequestData,
  canReply: boolean,
  template: EmailTemplate = CURRENT_EMAIL_TEMPLATE,
  logoUrl?: string
) {
  const rows: Row[] = [
    ["Referencia", reference],
    ["Negocio u organización", d.businessName],
    ["Servicio", labelFor(SERVICES, d.service)],
    ["Objetivo principal", d.goal],
  ];
  const { text, html } = render(
    [
      `Hola, ${d.contactName}:`,
      `Recibimos tu solicitud de cotización en ${site.name}. Este es un resumen breve de lo que enviaste.`,
    ],
    rows,
    [
      "Este mensaje solo confirma que recibimos tu solicitud. No constituye una cotización ni reserva una fecha.",
      ...(canReply ? ["Si quieres añadir información, puedes responder a este email."] : []),
    ],
    template,
    { signature: `${site.name} · ${site.location}`, logoUrl }
  );
  return { subject: oneLine(`Recibimos tu solicitud de cotización (${reference})`), text, html };
}

export function ownerNotificationEmail(
  reference: string,
  d: QuoteRequestData,
  template: EmailTemplate = CURRENT_EMAIL_TEMPLATE,
  logoUrl?: string
) {
  const rows: Row[] = [["Referencia", reference], ...fullSummaryRows(d)];
  const { text, html } = render(
    ["Nueva solicitud de cotización desde el sitio web.", "Estado inicial en Supabase: nueva."],
    rows,
    ["Las funciones seleccionadas son necesidades por evaluar, no inclusiones acordadas."],
    template,
    { logoUrl }
  );
  return { subject: oneLine(`Nueva solicitud ${reference}: ${d.businessName}`), text, html };
}
