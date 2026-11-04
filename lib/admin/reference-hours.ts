import { originKey, type CatalogOrigin } from "./catalog";
import type { StoredDraft } from "./draft";
import { computeTotals } from "./money";

/**
 * Internal work reference for the admin: "Horas de referencia = subtotal de
 * servicios / $75". It is not an estimate of duration nor a promise to the
 * client, and it never appears in PDFs, emails or client documents.
 *
 * Third-party costs and expenses passed on to the client must be left out.
 * Lines do not record that distinction, so only lines that are certainly a
 * RedCode service count: base services and add-ons from the catalog. Lines
 * typed by hand or from a manual-evaluation entry (photography, integrations,
 * logo, special features) may include third-party costs: with any of them
 * the reference stays pending.
 */
export const REFERENCE_RATE_CENTS = 7_500;

export type ReferenceHours =
  | { status: "ok"; serviceCents: number; tenthsOfHour: number }
  | { status: "pendiente"; reasons: string[] };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function referenceHours(
  items: StoredDraft["items"],
  origins: Record<string, CatalogOrigin>
): ReferenceHours {
  if (items.length === 0) return { status: "pendiente", reasons: ["El borrador guardado no tiene partidas."] };

  const kind = (i: StoredDraft["items"][number]) =>
    i.catalogCode && i.catalogVersion ? origins[originKey(i.catalogCode, i.catalogVersion)]?.kind : undefined;
  const manual = items.filter((i) => !i.catalogCode).length;
  const evaluated = items.filter((i) => kind(i) === "manual").length;
  const unknown = items.filter((i) => i.catalogCode && kind(i) === undefined).length;
  const totals = computeTotals(items);

  const reasons: string[] = [];
  if (manual) {
    reasons.push(
      `${plural(manual, "partida añadida", "partidas añadidas")} a mano: no indica si es un servicio de RedCode o un costo de terceros o gasto trasladado al cliente.`
    );
  }
  if (evaluated) {
    reasons.push(
      `${plural(evaluated, "partida", "partidas")} de evaluación manual (logo, fotografía, integraciones o funciones especiales): puede incluir costos de terceros.`
    );
  }
  if (unknown) reasons.push(`${plural(unknown, "partida", "partidas")} con un origen de catálogo que no se encontró.`);
  if (totals.incomplete) reasons.push("Hay partidas sin cantidad o precio.");
  if (reasons.length) return { status: "pendiente", reasons };

  // Half-up to a tenth of an hour, in integers: round(cents × 10 / rate).
  const tenthsOfHour = Math.floor((totals.totalCents * 20 + REFERENCE_RATE_CENTS) / (2 * REFERENCE_RATE_CENTS));
  return { status: "ok", serviceCents: totals.totalCents, tenthsOfHour };
}

export const formatTenthsOfHour = (tenths: number) => `${Math.floor(tenths / 10)}.${tenths % 10} h`;
