import { site } from "@/lib/site";
import type { StoredDraft } from "./draft";
import { computeTotals } from "./money";

/**
 * Pure rules for finalizing and sending quotes, shared by the UI (to explain
 * problems up front) and the server (which enforces them again, as does SQL).
 */

/** What blocks finalizing the saved draft. Empty means it can be finalized. */
export function finalizeProblems(draft: StoredDraft | null): string[] {
  if (!draft) return ["Todavía no hay un borrador guardado."];
  const problems: string[] = [];
  if (!draft.title) problems.push("Falta el título.");
  if (!draft.summary) problems.push("Falta el resumen y alcance.");
  if (!draft.deliverables) problems.push("Faltan los entregables.");
  if (draft.items.length === 0) problems.push("Añade al menos una partida.");
  draft.items.forEach((item, i) => {
    const missing = [
      !item.description && "descripción",
      item.quantityHundredths === null && "cantidad",
      item.unitPriceCents === null && "precio",
    ].filter(Boolean);
    if (missing.length) problems.push(`Partida ${i + 1}: falta ${missing.join(", ")}.`);
    else if ((item.quantityHundredths ?? 0) <= 0) problems.push(`Partida ${i + 1}: la cantidad debe ser mayor que 0.`);
  });
  if (draft.items.length > 0 && problems.length === 0 && computeTotals(draft.items).totalCents <= 0) {
    problems.push("El total debe ser mayor que $0.00.");
  }
  return problems;
}

export type SendStatus = "pendiente" | "en_proceso" | "aceptado" | "fallido" | "incierto";
export type SendOutcome = "aceptado" | "fallido" | "incierto";

export const SEND_STATUS: Record<SendStatus, { label: string; detail: string; tone: "ok" | "warn" | "error" | "muted" }> = {
  pendiente: { label: "Pendiente", detail: "Registrado; todavía no se ha llamado a Resend.", tone: "muted" },
  en_proceso: { label: "En proceso", detail: "Se está enviando a Resend.", tone: "muted" },
  aceptado: {
    label: "Aceptado por Resend",
    detail: "Resend aceptó el email para envío. La entrega al buzón no está confirmada.",
    tone: "ok",
  },
  fallido: { label: "Fallido", detail: "Resend lo rechazó o se confirmó que no se envió.", tone: "error" },
  incierto: {
    label: "Resultado incierto",
    detail: "No se sabe si Resend aceptó el email. No se reintenta solo: compruébalo antes.",
    tone: "warn",
  },
};

export const STATUS_EFFECT_LABEL: Record<string, string> = {
  cambiado: "La solicitud pasó a Propuesta enviada.",
  sin_cambio_propuesta_enviada: "La solicitud ya estaba en Propuesta enviada.",
  sin_cambio_aceptada: "La solicitud estaba Aceptada y no se cambió.",
  sin_cambio_cerrada: "La solicitud estaba Cerrada y no se cambió.",
};

/** Explicit rule applied in the database when Resend accepts a send. */
export const STATUS_RULE =
  "Cuando Resend acepta el envío, una solicitud Nueva o Por aclarar pasa a Propuesta enviada. Si ya está en Propuesta enviada, Aceptada o Cerrada, no cambia.";

/**
 * Maps the mailer result to a send outcome. Only a definite answer from Resend
 * is "fallido"; anything where Resend may have accepted the email (timeouts,
 * network errors, 5xx, idempotency conflicts) is "incierto" and never retried
 * automatically with a new key.
 */
export function classifySendResult(
  result: { ok: true; id: string | null } | { ok: false; error: string }
): { outcome: SendOutcome; providerId: string | null; error: string | null } {
  if (result.ok) {
    return result.id && /^[A-Za-z0-9_-]{1,100}$/.test(result.id)
      ? { outcome: "aceptado", providerId: result.id, error: null }
      : { outcome: "incierto", providerId: null, error: "accepted_without_id" };
  }
  const error = result.error.slice(0, 100);
  const status = /^http_(\d{3})_/.exec(error)?.[1];
  if (!status) return { outcome: "incierto", providerId: null, error }; // timeout, network_error
  const code = Number(status);
  if (code >= 500 || code === 409 || code === 408) return { outcome: "incierto", providerId: null, error };
  return { outcome: "fallido", providerId: null, error }; // 4xx (incl. 429): Resend did not accept it
}

/** Whether the current delivery settings allow emailing this address. */
export function recipientAllowed(email: string, allowlist: string[] | null) {
  return allowlist === null || allowlist.includes(email.trim().toLowerCase());
}

export const SUBJECT_MAX = 200;
export const BODY_MAX = 5000;

export type QuoteEmailContext = {
  quoteReference: string;
  revision: number;
  businessName: string;
  contactName: string;
};

/** Editable defaults for the review screen. No commercial terms are added. */
export function defaultQuoteEmail(q: QuoteEmailContext, canReply: boolean) {
  const subject = `Cotización ${q.quoteReference} · ${site.name}`;
  const body = [
    `Hola, ${q.contactName}:`,
    `Te envío la cotización ${q.quoteReference} (revisión ${q.revision}) para ${q.businessName}. La encontrarás adjunta en PDF.`,
    ...(canReply ? ["Si tienes preguntas o quieres ajustar algo, puedes responder a este email."] : []),
    `${site.owner}\n${site.name}`,
  ].join("\n\n");
  return { subject, body };
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Subjects are single-line. */
export const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, " ").trim();

/** HTML version of the plain-text body: escaped, paragraphs and line breaks kept. */
export function quoteEmailHtml(body: string) {
  const paragraphs = body
    .trim()
    .split(/\r?\n\s*\r?\n/)
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p.trim()).replace(/\r?\n/g, "<br>")}</p>`)
    .join("\n");
  return `<!doctype html><html lang="es"><body style="font-family:Arial,Helvetica,sans-serif;color:#18181b;line-height:1.55;max-width:600px;margin:0 auto;padding:16px">
${paragraphs}
</body></html>`;
}

export const pdfFilename = (quoteReference: string, revision: number) =>
  `Cotizacion-${quoteReference}-rev${revision}.pdf`;
