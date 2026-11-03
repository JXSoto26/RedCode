"use client";

import * as React from "react";
import { BookOpen, Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CATALOG_KIND_LABELS,
  catalogLine,
  checkAdd,
  type CatalogEntry,
  type CatalogItemFields,
} from "@/lib/admin/catalog";
import type { Suggestion, SuggestionKind } from "@/lib/admin/catalog-rules";
import { formatCents } from "@/lib/admin/money";
import { cn } from "@/lib/utils";

type Line = ReturnType<typeof catalogLine>;

const KIND_STYLE: Record<SuggestionKind, { label: string; className: string }> = {
  cargo: { label: "Sugerido", className: "border-success-400/30 bg-success-500/10 text-success-200" },
  revision: { label: "Revisar", className: "border-amber-400/30 bg-amber-400/10 text-amber-200" },
  incluido: { label: "Incluido", className: "border-white/15 bg-white/[0.04] text-muted" },
  nota: { label: "Nota", className: "border-white/15 bg-white/[0.04] text-muted" },
};

const price = (e: CatalogEntry) => (e.priceCents === null ? "Sin precio (evaluación manual)" : `${formatCents(e.priceCents)} / ${e.unit}`);

/**
 * "Añadir desde catálogo": shows suggestions for this request and the full
 * catalog. Nothing is added without a click; a duplicate or a second base
 * service needs a second, explicit click.
 */
export function CatalogPicker({
  catalog,
  suggestions,
  lines,
  full,
  onAdd,
}: {
  catalog: CatalogEntry[];
  suggestions: Suggestion[];
  lines: CatalogItemFields[];
  full: boolean;
  onAdd: (line: Line) => void;
}) {
  const byCode = React.useMemo(() => new Map(catalog.map((e) => [e.code, e])), [catalog]);
  const baseCodes = React.useMemo(() => new Set(catalog.filter((e) => e.kind === "base").map((e) => e.code)), [catalog]);
  const [confirming, setConfirming] = React.useState<string | null>(null);
  const [announce, setAnnounce] = React.useState("");

  const add = (key: string, entry: CatalogEntry, opts: { quantity?: number; reason?: string }) => {
    const check = checkAdd(lines, entry, baseCodes);
    if (check !== "ok" && confirming !== key) {
      setConfirming(key);
      return;
    }
    setConfirming(null);
    onAdd(catalogLine(entry, opts));
    setAnnounce(`Añadida: ${entry.title}. Revisa la cantidad y el precio, y guarda el borrador.`);
  };

  const addButton = (key: string, entry: CatalogEntry, opts: { quantity?: number; reason?: string }) => {
    const check = checkAdd(lines, entry, baseCodes);
    const asking = confirming === key && check !== "ok";
    return (
      <div className="flex flex-col items-start gap-1.5 sm:items-end">
        <Button
          type="button"
          size="sm"
          variant={asking ? "outline" : "secondary"}
          disabled={full}
          onClick={() => add(key, entry, opts)}
          aria-label={`${asking ? "Añadir otra vez" : "Añadir"}: ${entry.title}`}
        >
          {check === "duplicate" && !asking ? <Check aria-hidden /> : <Plus aria-hidden />}
          {asking ? "Añadir otra vez" : check === "duplicate" ? "Ya añadida" : "Añadir"}
        </Button>
        {asking && (
          <p className="max-w-56 text-xs text-amber-200 sm:text-right">
            {check === "duplicate" ? "Ya está en el borrador." : "Ya hay un servicio base en el borrador."} Pulsa otra vez
            para añadirla de todos modos.
          </p>
        )}
      </div>
    );
  };

  const groups = (["base", "adicional", "manual"] as const).map((kind) => ({
    kind,
    entries: catalog.filter((e) => e.kind === kind),
  }));

  return (
    <details className="group rounded-xl border border-border bg-background/40">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-4 py-3 text-sm font-medium hover:bg-white/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/70">
        <BookOpen className="size-4 shrink-0 text-muted" aria-hidden />
        <span className="whitespace-nowrap">Añadir desde catálogo</span>
        <span className="basis-full text-xs font-normal text-muted-2 sm:ml-auto sm:basis-auto">
          Privado: el cliente solo ve las partidas que apruebes
        </span>
      </summary>

      <div className="flex flex-col gap-6 border-t border-border p-4">
        <p role="status" aria-live="polite" className={cn("text-sm text-success-300", !announce && "sr-only")}>
          {announce}
        </p>

        <section aria-labelledby="catalog-suggestions">
          <h4 id="catalog-suggestions" className="text-sm font-semibold">
            Sugerencias según la solicitud
          </h4>
          <p className="mt-1 text-xs text-muted-2">
            Reglas fijas a partir de las respuestas del formulario. No usan el presupuesto del cliente y no se añaden solas.
          </p>
          {suggestions.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No hay sugerencias para esta solicitud.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {suggestions.map((s, i) => {
                const entry = s.code ? byCode.get(s.code) : undefined;
                const style = KIND_STYLE[s.kind];
                return (
                  <li
                    key={`${s.rule}-${i}`}
                    className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm">
                        <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", style.className)}>
                          {style.label}
                        </span>
                        {entry && (
                          <span className="font-medium">
                            {entry.title}
                            {s.quantity > 1 && ` × ${s.quantity}`}
                            <span className="font-normal text-muted"> · {price(entry)}</span>
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-sm text-muted">{s.reason}</p>
                    </div>
                    {entry && addButton(`s-${i}`, entry, { quantity: s.quantity, reason: s.reason })}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="catalog-all">
          <h4 id="catalog-all" className="text-sm font-semibold">
            Catálogo completo
          </h4>
          <p className="mt-1 text-xs text-muted-2">
            Precios en USD. Al añadir, la partida queda editable: descripción, cantidad y precio. No se aplican impuestos ni
            descuentos.
          </p>
          {groups.map(
            ({ kind, entries }) =>
              entries.length > 0 && (
                <div key={kind} className="mt-4">
                  <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-2">{CATALOG_KIND_LABELS[kind]}</h5>
                  <ul className="mt-2 flex flex-col gap-2">
                    {entries.map((e) => (
                      <li
                        key={e.code}
                        className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-3 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div className="min-w-0 text-sm">
                          <p className="font-medium">
                            {e.title}
                            <span className="font-normal text-muted"> · {price(e)}</span>
                            {e.requiresReview && <span className="ml-2 text-xs text-amber-200">Requiere revisión</span>}
                          </p>
                          {e.scope && <p className="mt-1 text-muted">Alcance: {e.scope}</p>}
                          {e.includes && <p className="mt-1 text-muted">Incluye: {e.includes}</p>}
                          {e.excludes && <p className="mt-1 text-muted-2">No incluye: {e.excludes}</p>}
                        </div>
                        {addButton(`c-${e.code}`, e, {})}
                      </li>
                    ))}
                  </ul>
                </div>
              )
          )}
        </section>
      </div>
    </details>
  );
}
