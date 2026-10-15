import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { PrintButton } from "@/components/admin/print-button";
import { requireAdmin } from "@/lib/admin/auth";
import { getRequestDetail } from "@/lib/admin/data";
import { pendingFields } from "@/lib/admin/draft";
import { formatDate } from "@/lib/admin/labels";
import { computeTotals, formatCents, hundredthsToDecimal } from "@/lib/admin/money";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Vista previa de cotización" };

function Missing({ label }: { label: string }) {
  return (
    <span className="rounded border border-dashed border-amber-500 bg-amber-50 px-1.5 py-0.5 text-sm text-amber-800">
      Pendiente: {label}
    </span>
  );
}

const lines = (text: string) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

function Block({ title, text, required = true }: { title: string; text: string | null; required?: boolean }) {
  if (!text && !required) return null;
  return (
    <section className="mt-8 break-inside-avoid">
      <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500">{title}</h2>
      <div className="mt-2 text-[15px] leading-relaxed">
        {text ? <p className="whitespace-pre-wrap">{text}</p> : <Missing label={title.toLowerCase()} />}
      </div>
    </section>
  );
}

function ListBlock({ title, text }: { title: string; text: string | null }) {
  return (
    <section className="mt-8 break-inside-avoid">
      <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500">{title}</h2>
      {text ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] leading-relaxed">
          {lines(text).map((l, i) => (
            <li key={i}>{l.replace(/^[-•*]\s*/, "")}</li>
          ))}
        </ul>
      ) : (
        <div className="mt-2">
          <Missing label={title.toLowerCase()} />
        </div>
      )}
    </section>
  );
}

/** Private preview. Not a public link and not sent anywhere. */
export default async function QuotePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  const request = await getRequestDetail(id);
  if (!request) notFound();

  const { draft, data } = request;
  const totals = draft ? computeTotals(draft.items) : null;
  const pending = pendingFields(draft);

  return (
    <AdminShell email={admin.email}>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/admin/solicitudes/${request.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Volver a la solicitud
        </Link>
        {draft && <PrintButton />}
      </div>

      {!draft ? (
        <p className="mt-8 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          Todavía no hay un borrador guardado para esta solicitud.
        </p>
      ) : (
        <>
          <p className="mt-4 text-sm text-muted print:hidden">
            Vista previa privada. No es un enlace público y no se envía al cliente.
            {pending.length > 0 && ` Faltan ${pending.length} ${pending.length === 1 ? "elemento" : "elementos"}.`}
          </p>

          <article className="quote-sheet mx-auto mt-6 max-w-[52rem] rounded-xl bg-white p-6 text-zinc-900 shadow-2xl sm:p-12 print:mt-0 print:max-w-none print:rounded-none print:p-0 print:shadow-none">
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 pb-6">
              <div>
                <p className="text-lg font-bold tracking-tight">
                  <span className="text-[#d20e1c]">Red</span>Code Web Design Studio
                </p>
                <p className="text-sm text-zinc-500">
                  {site.owner} · {site.location}
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="inline-block rounded border border-zinc-300 px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-zinc-500">
                  Borrador
                </p>
                <p className="mt-2 text-zinc-500">Ref. {request.reference}</p>
                <p className="text-zinc-500">{formatDate(draft.updatedAt)}</p>
              </div>
            </header>

            <div className="mt-8">
              <p className="text-sm text-zinc-500">Propuesta para</p>
              <p className="font-semibold">{data.businessName}</p>
              <p className="text-sm text-zinc-600">{data.contactName}</p>
            </div>

            <h1 className="mt-8 text-2xl font-bold tracking-tight sm:text-3xl">
              {draft.title ?? <Missing label="título" />}
            </h1>

            <Block title="Resumen y alcance" text={draft.summary} />
            <ListBlock title="Entregables" text={draft.deliverables} />
            <ListBlock title="Exclusiones" text={draft.exclusions} />

            <section className="mt-8">
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500">Inversión</h2>
              {draft.items.length === 0 ? (
                <div className="mt-2">
                  <Missing label="partidas" />
                </div>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[32rem] border-collapse text-[15px]">
                    <thead>
                      <tr className="border-b-2 border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-500">
                        <th scope="col" className="py-2 pr-3 font-semibold">Descripción</th>
                        <th scope="col" className="py-2 pr-3 text-right font-semibold">Cant.</th>
                        <th scope="col" className="py-2 pr-3 text-right font-semibold">Precio unitario</th>
                        <th scope="col" className="py-2 text-right font-semibold">Importe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.items.map((item, i) => {
                        const line = totals?.lines[i] ?? null;
                        return (
                          <tr key={item.id} className="border-b border-zinc-200 align-top">
                            <td className="py-2.5 pr-3">{item.description ?? <Missing label="descripción" />}</td>
                            <td className="py-2.5 pr-3 text-right tabular-nums">
                              {item.quantityHundredths === null ? (
                                <Missing label="cantidad" />
                              ) : (
                                hundredthsToDecimal(item.quantityHundredths).replace(/\.00$/, "")
                              )}
                            </td>
                            <td className="py-2.5 pr-3 text-right tabular-nums">
                              {item.unitPriceCents === null ? <Missing label="precio" /> : formatCents(item.unitPriceCents)}
                            </td>
                            <td className="py-2.5 text-right tabular-nums">{line === null ? "—" : formatCents(line)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row" colSpan={3} className="pt-4 pr-3 text-right text-sm font-semibold">
                          Total (USD)
                        </th>
                        <td className="pt-4 text-right text-lg font-bold tabular-nums">
                          {totals ? formatCents(totals.totalCents) : "—"}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                  {totals?.incomplete && (
                    <p className="mt-2 text-right text-xs text-amber-700">
                      Total parcial: hay partidas sin cantidad o precio.
                    </p>
                  )}
                </div>
              )}
            </section>

            <Block title="Tiempo estimado" text={draft.estimatedTime} required={false} />
            <Block title="Condiciones" text={draft.terms} required={false} />
            <Block title="Vigencia" text={draft.validity} required={false} />
          </article>
        </>
      )}
    </AdminShell>
  );
}
