import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, MessageCircle } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { DraftEditor } from "@/components/admin/draft-editor";
import { NoteForm } from "@/components/admin/note-form";
import { FinalizeForm } from "@/components/admin/quote-forms";
import { StatusBadge } from "@/components/admin/status-badge";
import { StatusForm } from "@/components/admin/status-form";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin/auth";
import { getRequestDetail } from "@/lib/admin/data";
import { pendingFields, toEditorItems } from "@/lib/admin/draft";
import {
  STATUS_LABELS,
  describeEmailStatus,
  formatDateTime,
  mailtoLink,
  whatsappLink,
} from "@/lib/admin/labels";
import { computeTotals, formatCents } from "@/lib/admin/money";
import { SEND_STATUS, finalizeProblems } from "@/lib/admin/quote-send";
import { listQuotesForRequest } from "@/lib/admin/quotes";
import { fullSummaryRows } from "@/lib/quote/emails";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Solicitud" };
// Finalizing generates the PDF in this page's Server Action.
export const maxDuration = 60;

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-surface p-5 sm:p-6", className)}>
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

const TONE: Record<string, string> = {
  ok: "text-emerald-300",
  warn: "text-amber-200",
  error: "text-brand-300",
  muted: "text-muted",
};

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  const request = await getRequestDetail(id);
  if (!request) notFound();

  const { data, draft } = request;
  const mail = mailtoLink(data.email);
  const whatsapp = whatsappLink(data.whatsapp);
  const pending = pendingFields(draft);
  const savedTotal = draft ? computeTotals(draft.items) : null;
  const quotes = await listQuotesForRequest(request.id);
  const problems = finalizeProblems(draft);
  const alreadyFinalized = draft ? quotes.find((q) => q.draftVersion === draft.version) : undefined;
  const nextRevision = (quotes[0]?.revision ?? 0) + 1;

  return (
    <AdminShell email={admin.email}>
      <Link
        href="/admin/solicitudes"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Solicitudes
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-sm text-brand-300">{request.reference}</p>
          <h1 className="mt-1 break-words text-2xl font-bold tracking-tight sm:text-3xl">{data.businessName}</h1>
          <p className="mt-1 text-sm text-muted">
            Recibida el {formatDateTime(request.createdAt)} · {data.contactName}
          </p>
        </div>
        <StatusBadge status={request.status} className="px-3 py-1 text-sm" />
      </div>

      {(mail || whatsapp) && (
        <div className="mt-5 flex flex-wrap gap-2">
          {mail && (
            <Button asChild variant="secondary" size="sm">
              <a href={mail}>
                <Mail aria-hidden />
                Escribir email
              </a>
            </Button>
          )}
          {whatsapp && (
            <Button asChild variant="secondary" size="sm">
              <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                <MessageCircle aria-hidden />
                Abrir WhatsApp
              </a>
            </Button>
          )}
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Section title="Información enviada">
            <dl className="divide-y divide-border">
              {fullSummaryRows(data).map(([label, value]) => (
                <div key={label} className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4">
                  <dt className="text-sm text-muted-2">{label}</dt>
                  <dd className="whitespace-pre-wrap break-words text-sm">{value}</dd>
                </div>
              ))}
              <div className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4">
                <dt className="text-sm text-muted-2">Consentimiento</dt>
                <dd className="text-sm">
                  Aceptado el {formatDateTime(request.consentedAt)} (versión {data.consentVersion})
                </dd>
              </div>
            </dl>
          </Section>

          <Section title="Borrador de cotización">
            {pending.length > 0 ? (
              <div className="mb-6 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4 text-sm">
                <p className="font-medium text-amber-100">Pendiente de completar</p>
                <ul className="mt-2 list-inside list-disc space-y-0.5 text-amber-100/80">
                  {pending.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mb-6 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] p-4 text-sm text-emerald-100">
                Todos los campos de la propuesta están completos.
              </p>
            )}
            {draft && (
              <p className="mb-4 text-xs text-muted-2">
                Última versión guardada: {draft.version}, el {formatDateTime(draft.updatedAt)}.
              </p>
            )}
            <DraftEditor
              requestId={request.id}
              version={draft?.version ?? null}
              text={{
                title: draft?.title ?? "",
                summary: draft?.summary ?? "",
                deliverables: draft?.deliverables ?? "",
                exclusions: draft?.exclusions ?? "",
                estimatedTime: draft?.estimatedTime ?? "",
                terms: draft?.terms ?? "",
                validity: draft?.validity ?? "",
              }}
              items={toEditorItems(draft)}
              savedTotal={savedTotal}
            />
          </Section>

          <Section title="Cotizaciones finalizadas">
            {alreadyFinalized ? (
              <p className="text-sm text-muted">
                La versión actual del borrador ya está finalizada como revisión {alreadyFinalized.revision}. Para otra
                revisión, guarda cambios en el borrador.
              </p>
            ) : problems.length > 0 ? (
              <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4 text-sm">
                <p className="font-medium text-amber-100">Para finalizar falta:</p>
                <ul className="mt-2 list-inside list-disc space-y-0.5 text-amber-100/80">
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-amber-100/70">Se revisa el borrador guardado; guarda tus cambios primero.</p>
              </div>
            ) : (
              draft && <FinalizeForm requestId={request.id} draftVersion={draft.version} nextRevision={nextRevision} />
            )}

            {quotes.length > 0 && (
              <ol className="mt-6 flex flex-col divide-y divide-border rounded-xl border border-border">
                {quotes.map((q) => (
                  <li key={q.id}>
                    <Link
                      href={`/admin/cotizaciones/${q.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm transition-colors hover:bg-white/[0.02]"
                    >
                      <span>
                        <span className="font-mono text-brand-300">{q.quoteReference}</span> · Revisión {q.revision}
                        <span className="block text-xs text-muted-2">
                          {formatDateTime(q.issuedAt)} · {q.hasPdf ? "PDF listo" : "Sin PDF"} ·{" "}
                          {q.lastSend ? SEND_STATUS[q.lastSend.status].label : "Sin enviar"}
                        </span>
                      </span>
                      <span className="font-semibold tabular-nums">{formatCents(q.totalCents)}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Section title="Estado">
            <StatusForm requestId={request.id} current={request.status} />
            <h3 className="mt-6 text-sm font-semibold">Historial</h3>
            {request.history.length === 0 ? (
              <p className="mt-2 text-sm text-muted-2">Sin cambios desde que se recibió.</p>
            ) : (
              <ol className="mt-3 flex flex-col gap-3">
                {request.history.map((h) => (
                  <li key={h.id} className="border-l-2 border-border pl-3 text-sm">
                    <p>
                      {STATUS_LABELS[h.from]} → <span className="font-medium">{STATUS_LABELS[h.to]}</span>
                    </p>
                    <p className="text-xs text-muted-2">
                      {formatDateTime(h.at)} · {h.by || "Administrador"}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section title="Emails automáticos">
            <ul className="flex flex-col gap-4">
              {(
                [
                  ["Confirmación al visitante", request.visitorEmail],
                  ["Aviso interno", request.ownerEmail],
                ] as const
              ).map(([label, n]) => {
                const d = describeEmailStatus(n.status, n.lastError, n.attempts);
                return (
                  <li key={label} className="text-sm">
                    <p className="font-medium">{label}</p>
                    <p className={cn("mt-0.5", TONE[d.tone])}>{d.label}</p>
                    <p className="text-xs text-muted-2">
                      {d.detail}
                      {n.sentAt && ` Aceptado el ${formatDateTime(n.sentAt)}.`}
                    </p>
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section title="Notas internas">
            <NoteForm requestId={request.id} />
            {request.legacyNotes && (
              <div className="mt-5 rounded-xl border border-border bg-background/40 p-3 text-sm">
                <p className="text-xs text-muted-2">Nota anterior (editada desde Supabase)</p>
                <p className="mt-1 whitespace-pre-wrap break-words">{request.legacyNotes}</p>
              </div>
            )}
            {request.notes.length > 0 && (
              <ol className="mt-5 flex flex-col gap-4">
                {request.notes.map((n) => (
                  <li key={n.id} className="text-sm">
                    <p className="whitespace-pre-wrap break-words">{n.body}</p>
                    <p className="mt-1 text-xs text-muted-2">
                      {formatDateTime(n.at)} · {n.by || "Administrador"}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>
      </div>
    </AdminShell>
  );
}
