"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getEmailSettings } from "@/lib/quote/config";
import { requireAdmin } from "./auth";
import { getRequestDetail } from "./data";
import {
  BODY_MAX,
  SUBJECT_MAX,
  classifySendResult,
  finalizeProblems,
  oneLine,
  pdfFilename,
  quoteEmailHtml,
  recipientAllowed,
} from "./quote-send";
import { ensureQuotePdf, getQuote, loadStoredPdf, type Quote, type QuoteSend } from "./quotes";
import type { AdminSupabase } from "./supabase";

/**
 * Server Actions for finalizing and sending quotes. Each one checks the admin
 * and validates its input itself. Nothing here sends email except
 * confirmSend (explicit "Confirmar envío") and reconcileSend (explicit
 * "Comprobar con Resend", same payload and idempotency key).
 */

export type QuoteActionState = { ok: boolean; message: string | null; problems?: string[] };

const SEND_TIMEOUT_MS = 25_000;
const quotePath = (id: string) => `/admin/cotizaciones/${id}`;

function rpcMessage(code: string | undefined, conflict: string) {
  switch (code) {
    case "RC409":
      return conflict;
    case "RC404":
      return "No se encontró el registro.";
    case "RC403":
      return "Tu cuenta no tiene acceso al panel.";
    case "RC422":
      return "Los datos no son válidos.";
    default:
      console.error("[admin] quote_rpc_failed", { code: code ?? "unknown" });
      return "No se pudo completar la operación. Inténtalo de nuevo.";
  }
}

// --- Finalize ---------------------------------------------------------------------

const finalizeSchema = z.object({ requestId: z.uuid(), expectedVersion: z.coerce.number().int().min(1) });

/** Freezes the saved draft into an immutable revision and generates its PDF. Sends nothing. */
export async function finalizeQuote(_prev: QuoteActionState, formData: FormData): Promise<QuoteActionState> {
  const { supabase } = await requireAdmin();
  const parsed = finalizeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Solicitud no válida." };
  const { requestId, expectedVersion } = parsed.data;

  const request = await getRequestDetail(requestId);
  if (!request) return { ok: false, message: "La solicitud no existe." };
  if (!request.draft || request.draft.version !== expectedVersion) {
    return { ok: false, message: "El borrador cambió desde que lo revisaste. Recarga la página y revísalo de nuevo." };
  }
  const problems = finalizeProblems(request.draft);
  if (problems.length) return { ok: false, message: "El borrador no se puede finalizar todavía.", problems };

  const { data, error } = await supabase.rpc("admin_finalize_quote", {
    p_request_id: requestId,
    p_expected_version: expectedVersion,
  });
  if (error) {
    return {
      ok: false,
      message: rpcMessage(error.code, "El borrador cambió desde que lo revisaste. Recarga la página y revísalo de nuevo."),
    };
  }
  const quoteId = (data as { quote_id: string }[])[0]?.quote_id;
  if (!quoteId) return { ok: false, message: "No se pudo finalizar." };

  // The revision exists even if the PDF fails; the quote page can retry it.
  const quote = await getQuote(quoteId);
  if (quote) {
    try {
      await ensureQuotePdf(supabase, quote);
    } catch (e) {
      console.error("[admin] pdf_failed", { quoteId, code: e instanceof Error ? e.message : "unknown" });
    }
  }
  revalidatePath(`/admin/solicitudes/${requestId}`);
  redirect(quotePath(quoteId));
}

const quoteIdSchema = z.object({ quoteId: z.uuid() });

/** Generates the PDF of a revision that does not have one yet. Never replaces an existing PDF. */
export async function generateQuotePdf(_prev: QuoteActionState, formData: FormData): Promise<QuoteActionState> {
  const { supabase } = await requireAdmin();
  const parsed = quoteIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Cotización no válida." };
  const quote = await getQuote(parsed.data.quoteId);
  if (!quote) return { ok: false, message: "La cotización no existe." };
  try {
    await ensureQuotePdf(supabase, quote);
  } catch (e) {
    console.error("[admin] pdf_failed", { quoteId: quote.id, code: e instanceof Error ? e.message : "unknown" });
    return { ok: false, message: "No se pudo generar el PDF. Inténtalo de nuevo." };
  }
  revalidatePath(quotePath(quote.id));
  return { ok: true, message: "PDF generado." };
}

// --- Send ---------------------------------------------------------------------------

const sendSchema = z.object({
  quoteId: z.uuid(),
  requestKey: z.uuid(),
  kind: z.enum(["envio", "reenvio"]),
  subject: z.string().transform(oneLine).pipe(z.string().min(1, "Escribe el asunto.").max(SUBJECT_MAX, `Asunto: máximo ${SUBJECT_MAX} caracteres.`)),
  body: z.string().trim().min(1, "Escribe el mensaje.").max(BODY_MAX, `Mensaje: máximo ${BODY_MAX} caracteres.`),
  confirm: z.literal("si", { message: "Marca la casilla para confirmar el envío." }),
});

type EmailSettingsT = NonNullable<ReturnType<typeof getEmailSettings>>;

function deliveryCheck(settings: EmailSettingsT | null, recipient: string): string | null {
  if (!settings) return "El email no está configurado en este entorno.";
  if (!recipientAllowed(recipient, settings.allowlist)) {
    return `Envío bloqueado: ${recipient} no está en la lista de destinatarios autorizados de este entorno (QUOTE_EMAIL_ALLOWLIST).`;
  }
  return null;
}

async function loadSend(supabase: AdminSupabase, sendId: string): Promise<QuoteSend | null> {
  const quote = await supabase.from("quote_sends").select("quote_id").eq("id", sendId).maybeSingle();
  if (quote.error || !quote.data) return null;
  const full = await getQuote(quote.data.quote_id);
  return full?.sends.find((s) => s.id === sendId) ?? null;
}

/**
 * Calls Resend for a claimed send and records the outcome. The payload is
 * rebuilt from the stored send (subject, body, exact PDF) so a reconciliation
 * retry is byte-for-byte identical and Resend's idempotency key dedupes it.
 */
async function deliver(supabase: AdminSupabase, settings: EmailSettingsT, quote: Quote, send: QuoteSend) {
  const finish = (outcome: string, providerId: string | null, error: string | null) =>
    supabase.rpc("admin_finish_quote_send", {
      p_send_id: send.id,
      p_outcome: outcome,
      p_provider_id: providerId,
      p_error: error,
    });

  let pdf: Uint8Array;
  try {
    pdf = await loadStoredPdf(supabase, send.pdfPath, send.pdfSha256);
  } catch (e) {
    // Failed before calling Resend: definitely not sent.
    const code = e instanceof Error ? e.message : "pdf_unavailable";
    await finish("fallido", null, code);
    return { ok: false, message: "No se pudo leer el PDF guardado; no se envió nada. Inténtalo de nuevo." };
  }

  const result = await settings.mailer
    .send({
      to: send.recipientEmail,
      subject: send.subject,
      text: send.body,
      html: quoteEmailHtml(send.body),
      ...(settings.replyTo && { replyTo: settings.replyTo }),
      idempotencyKey: `quote-send/${send.id}`,
      attachments: [{ filename: pdfFilename(quote.quoteReference, quote.revision), content: Buffer.from(pdf).toString("base64") }],
    })
    .catch(() => ({ ok: false as const, error: "network_error" }));

  const { outcome, providerId, error } = classifySendResult(result);
  const recorded = await finish(outcome, providerId, error);
  if (recorded.error) {
    // Resend answered but the database did not record it. The send stays
    // "en proceso"; "Comprobar con Resend" repeats the call with the same
    // idempotency key, so it cannot send a second email.
    console.error("[admin] send_record_failed", { sendId: send.id, outcome, providerId, code: recorded.error.code });
    return {
      ok: false,
      message:
        "Resend respondió, pero no se pudo registrar el resultado. No vuelvas a enviar: en unos minutos usa “Comprobar con Resend”.",
    };
  }

  if (outcome === "aceptado") return { ok: true, message: "Resend aceptó el email. La entrega al buzón no está confirmada." };
  if (outcome === "fallido") return { ok: false, message: `Resend no aceptó el envío (${error}). No se envió nada.` };
  return {
    ok: false,
    message: "No se sabe si Resend aceptó el email. No se reintentará solo. Revisa el registro de envíos y usa “Comprobar con Resend”.",
  };
}

/** The only action that sends a quote, after the admin pressed "Confirmar envío". */
export async function confirmSend(_prev: QuoteActionState, formData: FormData): Promise<QuoteActionState> {
  const { supabase } = await requireAdmin();
  const parsed = sendSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: "Revisa el envío.", problems: [...new Set(parsed.error.issues.map((i) => i.message))] };
  }
  const { quoteId, requestKey, kind, subject, body } = parsed.data;

  const quote = await getQuote(quoteId);
  if (!quote) return { ok: false, message: "La cotización no existe." };
  if (!quote.pdf) return { ok: false, message: "Genera el PDF antes de enviar." };

  const settings = getEmailSettings({ timeoutMs: SEND_TIMEOUT_MS });
  const blocked = deliveryCheck(settings, quote.recipientEmail);
  if (blocked) return { ok: false, message: blocked };

  const begun = await supabase.rpc("admin_begin_quote_send", {
    p_quote_id: quoteId,
    p_request_key: requestKey,
    p_kind: kind,
    p_subject: subject,
    p_body: body,
  });
  if (begun.error) {
    return {
      ok: false,
      message: rpcMessage(
        begun.error.code,
        kind === "envio"
          ? "Esta cotización ya se envió o tiene un envío en curso. Para enviarla otra vez usa “Reenviar”."
          : "Hay un envío en curso o sin resolver para esta cotización."
      ),
    };
  }
  const row = (begun.data as { send_id: string; status: string; existing: boolean }[])[0];

  const claim = await supabase.rpc("admin_claim_quote_send", { p_send_id: row.send_id, p_mode: "nuevo" });
  if (claim.error) return { ok: false, message: rpcMessage(claim.error.code, "No se pudo iniciar el envío.") };
  if (!(claim.data as { claimed: boolean }[])[0]?.claimed) {
    // Double click or another tab: that request is the one sending.
    revalidatePath(quotePath(quoteId));
    return { ok: true, message: "Este envío ya se está procesando o ya terminó. Revisa el registro de envíos." };
  }

  const send = await loadSend(supabase, row.send_id);
  if (!send) return { ok: false, message: "No se pudo leer el envío registrado." };
  const result = await deliver(supabase, settings!, quote, send);
  revalidatePath(quotePath(quoteId));
  revalidatePath(`/admin/solicitudes/${quote.requestId}`);
  return result;
}

const sendRefSchema = z.object({ quoteId: z.uuid(), sendId: z.uuid() });

/**
 * For an uncertain (or stuck) send: repeats the identical request with the
 * same idempotency key. Resend returns the original result if it had accepted
 * it, so no second email is sent. Only within Resend's idempotency window.
 */
export async function reconcileSend(_prev: QuoteActionState, formData: FormData): Promise<QuoteActionState> {
  const { supabase } = await requireAdmin();
  const parsed = sendRefSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Envío no válido." };

  const quote = await getQuote(parsed.data.quoteId);
  const send = quote?.sends.find((s) => s.id === parsed.data.sendId);
  if (!quote || !send) return { ok: false, message: "El envío no existe." };

  const settings = getEmailSettings({ timeoutMs: SEND_TIMEOUT_MS });
  const blocked = deliveryCheck(settings, send.recipientEmail);
  if (blocked) return { ok: false, message: blocked };

  const claim = await supabase.rpc("admin_claim_quote_send", { p_send_id: send.id, p_mode: "reconciliar" });
  if (claim.error) {
    return {
      ok: false,
      message: rpcMessage(
        claim.error.code,
        "Ya pasaron más de 23 horas: Resend ya no garantiza evitar duplicados. Resuélvelo manualmente con el panel de Resend."
      ),
    };
  }
  if (!(claim.data as { claimed: boolean }[])[0]?.claimed) {
    return { ok: false, message: "Este envío no se puede comprobar ahora (está en curso hace menos de 2 minutos o ya terminó)." };
  }

  const result = await deliver(supabase, settings!, quote, send);
  revalidatePath(quotePath(quote.id));
  revalidatePath(`/admin/solicitudes/${quote.requestId}`);
  return result;
}

const resolveSchema = z
  .object({
    quoteId: z.uuid(),
    sendId: z.uuid(),
    resolution: z.enum(["aceptado", "no_enviado"]),
    providerId: z.string().trim().max(100).optional(),
    confirm: z.literal("si", { message: "Marca la casilla para confirmar." }),
  })
  .refine((v) => v.resolution !== "aceptado" || /^[A-Za-z0-9_-]{1,100}$/.test(v.providerId ?? ""), {
    message: "Copia el ID del email desde el panel de Resend.",
  });

/** Manual reconciliation after checking the Resend dashboard. Never calls Resend. */
export async function resolveSend(_prev: QuoteActionState, formData: FormData): Promise<QuoteActionState> {
  const { supabase } = await requireAdmin();
  const parsed = resolveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  const { quoteId, sendId, resolution, providerId } = parsed.data;

  const { error } = await supabase.rpc("admin_resolve_quote_send", {
    p_send_id: sendId,
    p_resolution: resolution,
    p_provider_id: resolution === "aceptado" ? providerId : null,
  });
  if (error) return { ok: false, message: rpcMessage(error.code, "Este envío ya no está pendiente de resolver.") };

  const quote = await getQuote(quoteId);
  revalidatePath(quotePath(quoteId));
  if (quote) revalidatePath(`/admin/solicitudes/${quote.requestId}`);
  return { ok: true, message: resolution === "aceptado" ? "Registrado como aceptado por Resend." : "Registrado como no enviado." };
}
