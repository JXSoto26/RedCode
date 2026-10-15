"use client";

import { Pencil } from "lucide-react";
import {
  ASSET_STATUSES,
  ASSETS,
  BUSINESS_TYPES,
  FEATURES,
  SECTIONS,
  SERVICES,
  labelFor,
} from "@/lib/quote/options";
import { normalizeUrl, type QuoteFormValues } from "@/lib/quote/schema";

export const STEP_TITLES = {
  1: "Tu negocio",
  2: "Tu proyecto",
  3: "Lo que necesitas",
  4: "Resumen",
} as const;

type Row = [label: string, value: string];

const or = (value: string, fallback: string) => (value.trim() ? value.trim() : fallback);

function listValue(
  list: readonly { value: string; label: string }[],
  selected: string[],
  other: string
) {
  if (selected.length === 0) return "Sin especificar";
  return selected
    .map((v) => (v === "otra" && other.trim() ? `Otra: ${other.trim()}` : labelFor(list, v)))
    .join(", ");
}

function groups(v: QuoteFormValues): { step: 1 | 2 | 3; rows: Row[] }[] {
  const businessType =
    v.businessType === "otro" && v.businessTypeOther.trim()
      ? `Otro: ${v.businessTypeOther.trim()}`
      : labelFor(BUSINESS_TYPES, v.businessType);

  const project: Row[] = [
    ["Servicio", labelFor(SERVICES, v.service)],
    ["Objetivo principal", v.goal.trim()],
    ["Página actual", normalizeUrl(v.currentUrl) || "No indicada"],
  ];
  if (v.service === "rediseno") project.push(["Qué quieres mejorar", v.redesignImprovements.trim()]);

  const budget = v.budgetUndefined
    ? "No lo tengo definido"
    : v.budgetUsd.trim()
      ? `$${Number(v.budgetUsd.replace(/[,$\s]/g, "")).toLocaleString("en-US")} USD`
      : "Sin especificar";

  return [
    {
      step: 1,
      rows: [
        ["Persona de contacto", v.contactName.trim()],
        ["Negocio u organización", v.businessName.trim()],
        ["Email", v.email.trim()],
        ["WhatsApp", or(v.whatsapp, "No indicado")],
        ["Tipo de negocio", businessType],
      ],
    },
    { step: 2, rows: project },
    {
      step: 3,
      rows: [
        ["Secciones", listValue(SECTIONS, v.sections, v.sectionsOther)],
        ["Funciones por evaluar", listValue(FEATURES, v.features, v.featuresOther)],
        ...ASSETS.map(({ field, label }): Row => [label, labelFor(ASSET_STATUSES, v[field])]),
        ["Presupuesto aproximado", budget],
        ["Fecha deseada", v.dateUndefined ? "No tengo una fecha definida" : or(v.desiredDate, "Sin especificar")],
        ["Comentarios", or(v.comments, "Ninguno")],
      ],
    },
  ];
}

export function QuoteSummary({
  values,
  onEdit,
}: {
  values: QuoteFormValues;
  /** When provided, each group shows an "Editar" button. */
  onEdit?: (step: 1 | 2 | 3) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {groups(values).map(({ step, rows }) => (
        <section
          key={step}
          aria-labelledby={`summary-${step}`}
          className="rounded-xl border border-border bg-background/40 p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <h3 id={`summary-${step}`} className="text-base font-semibold">
              {STEP_TITLES[step]}
            </h3>
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(step)}
                aria-label={`Editar ${STEP_TITLES[step].toLowerCase()}`}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-brand-300 transition-colors hover:bg-brand-600/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/70"
              >
                <Pencil className="size-3.5" aria-hidden="true" />
                Editar
              </button>
            )}
          </div>
          <dl className="mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-[minmax(0,12rem)_1fr]">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-sm text-muted-2">{label}</dt>
                <dd className="whitespace-pre-wrap break-words text-sm text-foreground/90">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
