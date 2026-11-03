import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { CatalogEntryForm } from "@/components/admin/catalog-entry-form";
import { requireAdmin } from "@/lib/admin/auth";
import { CATALOG_KIND_LABELS, type CatalogKind } from "@/lib/admin/catalog";
import { listCatalog } from "@/lib/admin/catalog-data";
import { formatDateTime } from "@/lib/admin/labels";

export const metadata: Metadata = { title: "Catálogo de precios" };

const KINDS: CatalogKind[] = ["base", "adicional", "manual"];

export default async function CatalogPage() {
  const admin = await requireAdmin();
  const catalog = await listCatalog();

  return (
    <AdminShell email={admin.email}>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Catálogo de precios</h1>
      <div className="mt-3 max-w-3xl space-y-2 text-sm text-muted">
        <p>
          Precios sugeridos para los borradores, en USD. Es privado: no aparece en la web ni en los PDF. El cliente solo ve
          las partidas que apruebes en cada cotización.
        </p>
        <p>
          Guardar crea una versión nueva de ese elemento. Los borradores y las cotizaciones ya finalizadas conservan la
          versión que usaron, con su precio de origen.
        </p>
      </div>

      {KINDS.map((kind) => {
        const entries = catalog.filter((e) => e.kind === kind);
        if (entries.length === 0) return null;
        return (
          <section key={kind} className="mt-10">
            <h2 className="text-lg font-semibold">{CATALOG_KIND_LABELS[kind]}</h2>
            <ul className="mt-4 flex flex-col gap-4">
              {entries.map((e) => (
                <li key={e.code} className="rounded-2xl border border-border bg-surface p-5">
                  <p className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-2">
                    <span className="font-mono">{e.code}</span>
                    <span>Versión {e.version}</span>
                    <span>
                      {formatDateTime(e.createdAt)} · {e.createdByEmail || "—"}
                    </span>
                    {!e.active && (
                      <span className="rounded-full border border-white/15 px-2 py-0.5 font-semibold uppercase tracking-wide">
                        Desactivado
                      </span>
                    )}
                  </p>
                  <CatalogEntryForm entry={e} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </AdminShell>
  );
}
