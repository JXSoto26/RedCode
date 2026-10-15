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

function render(intro: string[], rows: Row[], outro: string[]) {
  const text = [
    ...intro,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    ...outro,
  ].join("\n");

  const html = `<!doctype html><html lang="es"><body style="font-family:Arial,Helvetica,sans-serif;color:#18181b;line-height:1.5;max-width:600px;margin:0 auto;padding:16px">
${intro.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n")}
<table role="presentation" style="border-collapse:collapse;width:100%;margin:16px 0">
${rows
  .map(
    ([k, v]) =>
      `<tr><th scope="row" style="text-align:left;vertical-align:top;padding:6px 12px 6px 0;border-bottom:1px solid #e4e4e7;white-space:nowrap">${escapeHtml(k)}</th><td style="padding:6px 0;border-bottom:1px solid #e4e4e7;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`
  )
  .join("\n")}
</table>
${outro.map((p) => `<p style="color:#52525b;font-size:14px">${escapeHtml(p)}</p>`).join("\n")}
</body></html>`;

  return { text, html };
}

export function visitorConfirmationEmail(reference: string, d: QuoteRequestData, canReply: boolean) {
  const rows: Row[] = [
    ["Referencia", reference],
    ["Negocio u organización", d.businessName],
    ["Servicio", labelFor(SERVICES, d.service)],
    ["Objetivo principal", d.goal],
  ];
  const { text, html } = render(
    [
      `Hola, ${d.contactName}:`,
      `Recibí tu solicitud de cotización en ${site.name}. Este es un resumen breve de lo que enviaste.`,
    ],
    rows,
    [
      "Este mensaje solo confirma que recibí tu solicitud. No constituye una cotización ni reserva una fecha.",
      ...(canReply ? ["Si quieres añadir información, puedes responder a este email."] : []),
      `${site.owner} · ${site.name} · ${site.location}`,
    ]
  );
  return { subject: oneLine(`Recibí tu solicitud de cotización (${reference})`), text, html };
}

export function ownerNotificationEmail(reference: string, d: QuoteRequestData) {
  const rows: Row[] = [["Referencia", reference], ...fullSummaryRows(d)];
  const { text, html } = render(
    ["Nueva solicitud de cotización desde el sitio web.", "Estado inicial en Supabase: nueva."],
    rows,
    ["Las funciones seleccionadas son necesidades por evaluar, no inclusiones acordadas."]
  );
  return { subject: oneLine(`Nueva solicitud ${reference}: ${d.businessName}`), text, html };
}
