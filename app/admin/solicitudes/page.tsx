import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Inbox, Search } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/quote/fields";
import { requireAdmin } from "@/lib/admin/auth";
import { listRequests, parseListParams, type ListParams } from "@/lib/admin/data";
import { STATUS_LABELS, formatDateTime } from "@/lib/admin/labels";
import { REQUEST_STATUSES, SERVICES, labelFor } from "@/lib/quote/options";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Solicitudes" };

function listHref(params: ListParams, page: number) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.status) search.set("estado", params.status);
  if (page > 1) search.set("pagina", String(page));
  const qs = search.toString();
  return `/admin/solicitudes${qs ? `?${qs}` : ""}`;
}

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin();
  const params = parseListParams(await searchParams);
  const result = await listRequests(params);
  const filtered = Boolean(params.q || params.status);

  return (
    <AdminShell email={admin.email}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Solicitudes</h1>
          <p className="mt-1 text-sm text-muted">
            {result.ok ? `${result.total} ${result.total === 1 ? "solicitud" : "solicitudes"}` : " "}
            {result.ok && filtered && " con estos filtros"}
          </p>
        </div>
      </div>

      <form method="get" className="mt-6 grid gap-3 sm:grid-cols-[1fr_14rem_auto]" role="search">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="q" className="text-xs font-medium text-muted">
            Buscar por referencia, negocio o contacto
          </label>
          <input id="q" name="q" type="search" defaultValue={params.q} maxLength={80} className={fieldClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="estado" className="text-xs font-medium text-muted">
            Estado
          </label>
          <select id="estado" name="estado" defaultValue={params.status ?? ""} className={fieldClass}>
            <option value="">Todos</option>
            {REQUEST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit" variant="secondary" className="flex-1 sm:flex-none">
            <Search aria-hidden />
            Filtrar
          </Button>
          {filtered && (
            <Button asChild variant="ghost">
              <Link href="/admin/solicitudes">Limpiar</Link>
            </Button>
          )}
        </div>
      </form>

      <div className="mt-6">
        {!result.ok ? (
          <div role="alert" className="rounded-2xl border border-brand-600/40 bg-brand-600/10 p-6 text-sm text-brand-200">
            {result.error === "out_of_range" ? (
              <>
                Esa página no existe.{" "}
                <Link href={listHref(params, 1)} className="font-semibold underline underline-offset-4">
                  Ir a la primera página
                </Link>
              </>
            ) : (
              "No se pudieron cargar las solicitudes. Recarga la página en unos segundos."
            )}
          </div>
        ) : result.items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-16 text-center">
            <Inbox className="size-8 text-muted-2" aria-hidden />
            <p className="font-medium">{filtered ? "Ninguna solicitud coincide con la búsqueda." : "Todavía no hay solicitudes."}</p>
            {filtered && (
              <Link href="/admin/solicitudes" className="text-sm text-brand-300 underline underline-offset-4">
                Ver todas
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* Mobile: cards */}
            <ul className="flex flex-col gap-3 md:hidden">
              {result.items.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/admin/solicitudes/${r.id}`}
                    className="block rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-white/20"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-mono text-sm text-brand-300">{r.reference}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="mt-2 font-semibold">{r.businessName}</p>
                    <p className="text-sm text-muted">{r.contactName}</p>
                    <p className="mt-2 text-xs text-muted-2">
                      {labelFor(SERVICES, r.service)} · {formatDateTime(r.createdAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>

            {/* Desktop: table */}
            <div className="hidden overflow-hidden rounded-2xl border border-border md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-2">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Referencia</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Negocio</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Contacto</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Servicio</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Fecha</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface">
                  {result.items.map((r) => (
                    <tr key={r.id} className="transition-colors hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/solicitudes/${r.id}`}
                          className="font-mono text-brand-300 underline-offset-4 hover:underline focus-visible:underline"
                        >
                          {r.reference}
                        </Link>
                      </td>
                      <td className="max-w-56 truncate px-4 py-3 font-medium" title={r.businessName}>
                        {r.businessName}
                      </td>
                      <td className="max-w-48 truncate px-4 py-3 text-muted" title={r.contactName}>
                        {r.contactName}
                      </td>
                      <td className="px-4 py-3 text-muted">{labelFor(SERVICES, r.service)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDateTime(r.createdAt)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {result.pageCount > 1 && (
              <nav aria-label="Paginación" className="mt-6 flex items-center justify-between gap-3">
                <PageLink href={listHref(params, result.page - 1)} disabled={result.page <= 1}>
                  <ChevronLeft aria-hidden />
                  Anterior
                </PageLink>
                <p className="text-sm text-muted">
                  Página {result.page} de {result.pageCount}
                </p>
                <PageLink href={listHref(params, result.page + 1)} disabled={result.page >= result.pageCount}>
                  Siguiente
                  <ChevronRight aria-hidden />
                </PageLink>
              </nav>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  const className = cn(
    "inline-flex h-9 items-center gap-1 rounded-full border border-white/15 px-4 text-sm font-medium [&_svg]:size-4",
    disabled ? "pointer-events-none opacity-40" : "hover:border-white/25 hover:bg-white/[0.05]"
  );
  if (disabled) {
    return (
      <span aria-disabled="true" className={className}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
