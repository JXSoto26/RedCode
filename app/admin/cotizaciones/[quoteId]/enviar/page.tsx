import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileDown, ShieldAlert } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { SendForm } from "@/components/admin/quote-forms";
import { requireAdmin } from "@/lib/admin/auth";
import { formatCents } from "@/lib/admin/money";
import { SEND_STATUS, STATUS_RULE, defaultQuoteEmail, pdfFilename, recipientAllowed } from "@/lib/admin/quote-send";
import { formatDateTime } from "@/lib/admin/labels";
import { getQuote } from "@/lib/admin/quotes";
import { getEmailSettings } from "@/lib/quote/config";

export const metadata: Metadata = { title: "Revisar envío" };
// Sending (with the PDF attached) runs in this page's Server Action.
export const maxDuration = 60;

/** Review screen. Nothing is sent until "Confirmar envío" is pressed. */
export default async function ReviewSendPage({
  params,
  searchParams,
}: {
  params: Promise<{ quoteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin();
  const { quoteId } = await params;
  const kind = (await searchParams).tipo === "reenvio" ? "reenvio" : "envio";
  const quote = await getQuote(quoteId);
  if (!quote) notFound();

  const settings = getEmailSettings();
  const allowed = settings ? recipientAllowed(quote.recipientEmail, settings.allowlist) : false;
  const { subject, body } = defaultQuoteEmail(quote, Boolean(settings?.replyTo));
  const open = quote.sends.some((s) => ["pendiente", "en_proceso", "incierto"].includes(s.status));
  const alreadySent = quote.sends.some((s) => s.kind === "envio" && s.status === "aceptado");
  const last = quote.sends[0] ?? null;
  const unavailable =
    !quote.pdf
      ? "Esta revisión todavía no tiene PDF."
      : open
        ? "Hay un envío sin terminar para esta cotización. Resuélvelo antes de enviar otra vez."
        : kind === "envio" && alreadySent
          ? "Esta cotización ya se envió. Para enviarla otra vez usa “Reenviar”."
          : kind === "reenvio" && !quote.sends.some((s) => s.status === "aceptado")
            ? "Todavía no se ha enviado: usa “Revisar y enviar”."
            : null;

  return (
    <AdminShell email={admin.email}>
      <Link
        href={`/admin/cotizaciones/${quote.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {quote.quoteReference} · Revisión {quote.revision}
      </Link>
      <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
        {kind === "reenvio" ? "Revisar reenvío" : "Revisar envío"}
      </h1>
      <p className="mt-1 text-sm text-muted">Nada se envía hasta que pulses el botón de confirmación.</p>

      {last && (
        <div role="status" className="mt-6 rounded-xl border border-border bg-surface-2 p-4 text-sm">
          <p>
            Último {last.kind === "reenvio" ? "reenvío" : "envío"} ({formatDateTime(last.createdAt)}):{" "}
            <strong>{SEND_STATUS[last.status].label}</strong>
          </p>
          <p className="mt-1 text-xs text-muted-2">
            {SEND_STATUS[last.status].detail}{" "}
            <Link href={`/admin/cotizaciones/${quote.id}`} className="underline underline-offset-4">
              Ver el registro de envíos
            </Link>
          </p>
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="flex min-w-0 flex-col gap-5 rounded-2xl border border-border bg-surface p-5 sm:p-6 lg:col-span-2">
          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[9rem_1fr]">
            <dt className="text-muted-2">Para</dt>
            <dd className="break-all font-medium">
              {quote.contactName} &lt;{quote.recipientEmail}&gt;
            </dd>
            <dt className="text-muted-2">Referencia</dt>
            <dd>
              {quote.quoteReference} · Revisión {quote.revision}
            </dd>
            <dt className="text-muted-2">Total</dt>
            <dd className="tabular-nums">{formatCents(quote.totalCents)} USD</dd>
            <dt className="text-muted-2">Adjunto</dt>
            <dd>
              {quote.pdf ? (
                <a
                  href={`/admin/cotizaciones/${quote.id}/pdf`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1.5 text-brand-300 underline underline-offset-4"
                >
                  <FileDown className="size-4" aria-hidden />
                  {pdfFilename(quote.quoteReference, quote.revision)}
                </a>
              ) : (
                "Sin PDF"
              )}
              {quote.pdf && (
                <span className="mt-1 block break-all font-mono text-xs text-muted-2">sha256 {quote.pdf.sha256}</span>
              )}
            </dd>
          </dl>
          <p className="text-xs text-muted-2">
            El destinatario es el email de la solicitud y no se puede cambiar aquí.
          </p>

          {!settings ? (
            <p role="alert" className="rounded-xl border border-brand-600/40 bg-brand-600/10 p-3 text-sm text-brand-200">
              El email no está configurado en este entorno.
            </p>
          ) : !allowed ? (
            <p role="alert" className="flex gap-2 rounded-xl border border-brand-600/40 bg-brand-600/10 p-3 text-sm text-brand-200">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              Envío bloqueado: {quote.recipientEmail} no está en la lista de destinatarios autorizados de este entorno
              (QUOTE_EMAIL_ALLOWLIST).
            </p>
          ) : null}

          {unavailable ? (
            <p className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3 text-sm text-amber-100">{unavailable}</p>
          ) : (
            <SendForm
              quoteId={quote.id}
              requestKey={randomUUID()}
              kind={kind}
              defaultSubject={subject}
              defaultBody={body}
              blocked={!settings || !allowed}
            />
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-surface p-5 text-sm sm:p-6">
          <h2 className="text-base font-semibold">Qué pasará</h2>
          <ul className="list-inside list-disc space-y-2 text-muted">
            <li>Se envía un email con Resend al destinatario, con el PDF exacto de arriba adjunto.</li>
            <li>Queda registrado: versión, destinatario, asunto, mensaje, PDF (hash), quién confirmó y el resultado.</li>
            <li>“Aceptado por Resend” no significa entregado: la entrega no se confirma.</li>
            <li>{STATUS_RULE}</li>
            <li>Un doble clic o recargar la página no envía dos veces.</li>
          </ul>
        </aside>
      </div>
    </AdminShell>
  );
}
