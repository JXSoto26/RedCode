import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileDown, Repeat, Send } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { GeneratePdfForm } from "@/components/admin/quote-forms";
import { SendLog } from "@/components/admin/send-log";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin/auth";
import { formatDateTime } from "@/lib/admin/labels";
import { formatCents, hundredthsToDecimal } from "@/lib/admin/money";
import { STATUS_RULE } from "@/lib/admin/quote-send";
import { getQuote } from "@/lib/admin/quotes";

export const metadata: Metadata = { title: "Cotización" };
// PDF generation runs in this page's Server Action.
export const maxDuration = 60;

export default async function QuotePage({ params }: { params: Promise<{ quoteId: string }> }) {
  const admin = await requireAdmin();
  const { quoteId } = await params;
  const quote = await getQuote(quoteId);
  if (!quote) notFound();

  const open = quote.sends.find((s) => ["pendiente", "en_proceso", "incierto"].includes(s.status));
  const accepted = quote.sends.some((s) => s.status === "aceptado");
  const firstSent = quote.sends.some((s) => s.kind === "envio" && s.status === "aceptado");

  return (
    <AdminShell email={admin.email}>
      <Link
        href={`/admin/solicitudes/${quote.requestId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Solicitud {quote.requestReference}
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-sm text-brand-300">
            {quote.quoteReference} · Revisión {quote.revision}
          </p>
          <h1 className="mt-1 break-words text-2xl font-bold tracking-tight sm:text-3xl">{quote.title}</h1>
          <p className="mt-1 text-sm text-muted">
            Finalizada el {formatDateTime(quote.issuedAt)} por {quote.issuedByEmail} · borrador versión {quote.draftVersion}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted">Total</p>
          <p className="text-2xl font-semibold tabular-nums">{formatCents(quote.totalCents)}</p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <h2 className="text-base font-semibold">Documento</h2>
            <p className="mt-1 text-sm text-muted">
              Versión inmutable: los cambios posteriores del borrador no la modifican.
            </p>
            {quote.pdf ? (
              <div className="mt-4 flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="secondary" size="sm">
                    <a href={`/admin/cotizaciones/${quote.id}/pdf`} target="_blank" rel="noopener">
                      <FileDown aria-hidden />
                      Ver PDF
                    </a>
                  </Button>
                </div>
                <p className="break-all font-mono text-xs text-muted-2">
                  sha256 {quote.pdf.sha256} · {Math.round(quote.pdf.sizeBytes / 1024)} KB · generado el{" "}
                  {formatDateTime(quote.pdf.generatedAt)}
                </p>
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                <p className="text-sm text-amber-100">Esta revisión todavía no tiene PDF.</p>
                <GeneratePdfForm quoteId={quote.id} />
              </div>
            )}

            <dl className="mt-6 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="text-muted-2">Cliente</dt>
              <dd>
                {quote.businessName} · {quote.contactName}
              </dd>
              <dt className="text-muted-2">Destinatario</dt>
              <dd className="break-all">{quote.recipientEmail}</dd>
              <dt className="text-muted-2">Partidas</dt>
              <dd>
                <ul className="flex flex-col gap-1">
                  {quote.items.map((item, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="break-words">
                        {item.description} × {hundredthsToDecimal(item.quantityHundredths).replace(/\.00$/, "")}
                      </span>
                      <span className="tabular-nums">{formatCents(item.lineTotalCents)}</span>
                    </li>
                  ))}
                </ul>
              </dd>
            </dl>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <h2 className="text-base font-semibold">Registro de envíos</h2>
            <div className="mt-4">
              <SendLog quoteId={quote.id} sends={quote.sends} now={quote.loadedAt} />
            </div>
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <h2 className="text-base font-semibold">Enviar</h2>
            <p className="mt-2 flex items-center gap-2 text-sm text-muted">
              Estado de la solicitud: <StatusBadge status={quote.requestStatus} />
            </p>
            <p className="mt-3 text-xs text-muted-2">{STATUS_RULE}</p>
            <div className="mt-4 flex flex-col gap-2">
              {open ? (
                <p className="text-sm text-amber-100">
                  Hay un envío sin terminar. Resuélvelo en el registro de envíos antes de enviar otra vez.
                </p>
              ) : !quote.pdf ? (
                <p className="text-sm text-muted">Genera el PDF para poder enviarla.</p>
              ) : !firstSent ? (
                <Button asChild>
                  <Link href={`/admin/cotizaciones/${quote.id}/enviar`}>
                    <Send aria-hidden />
                    Revisar y enviar
                  </Link>
                </Button>
              ) : (
                <>
                  <p className="text-sm text-emerald-200">Ya se envió (aceptado por Resend).</p>
                  {accepted && (
                    <Button asChild variant="secondary">
                      <Link href={`/admin/cotizaciones/${quote.id}/enviar?tipo=reenvio`}>
                        <Repeat aria-hidden />
                        Reenviar…
                      </Link>
                    </Button>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </AdminShell>
  );
}
