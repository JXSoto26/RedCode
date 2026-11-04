import { centsToInput } from "./money";

/**
 * Private catalog of suggested prices (public.price_catalog_entries).
 * Shared by the server and the draft editor: no data access here.
 */

export const CATALOG_KINDS = ["base", "adicional", "manual"] as const;
export type CatalogKind = (typeof CATALOG_KINDS)[number];

export const CATALOG_KIND_LABELS: Record<CatalogKind, string> = {
  base: "Servicio base",
  adicional: "Adicional",
  manual: "Evaluación manual",
};

export const CATALOG_CODE = /^[a-z][a-z0-9_]{2,40}$/;

export const CATALOG_LIMITS = { title: 120, unit: 40, text: 1000, note: 500 } as const;

export type CatalogEntry = {
  code: string;
  version: number;
  kind: CatalogKind;
  title: string;
  unit: string;
  /** null = no automatic price (manual evaluation). */
  priceCents: number | null;
  scope: string;
  includes: string;
  excludes: string;
  requiresReview: boolean;
  active: boolean;
  position: number;
  createdAt: string;
  createdByEmail: string;
};

/** What the editor needs to show the origin of an item: "<code>@<version>". */
export type CatalogOrigin = { title: string; priceCents: number | null; unit: string; kind?: CatalogKind };
export const originKey = (code: string, version: number) => `${code}@${version}`;

/** Item as the editor keeps it. Catalog fields are internal: never on the PDF. */
export type CatalogItemFields = {
  catalogCode?: string;
  catalogVersion?: number;
  suggestionReason?: string;
  adjustmentNote?: string;
};

/** A new editor line from a catalog entry. Manual entries start without price. */
export function catalogLine(entry: CatalogEntry, opts: { quantity?: number; reason?: string } = {}) {
  return {
    description: entry.title,
    quantity: String(opts.quantity ?? 1),
    unitPrice: centsToInput(entry.priceCents),
    catalogCode: entry.code,
    catalogVersion: entry.version,
    suggestionReason: opts.reason ?? "",
    adjustmentNote: "",
  };
}

export type AddCheck = "ok" | "duplicate" | "second_base";

/**
 * Guards against accidental duplicates: the same entry twice, or a second
 * base service. The editor asks for an explicit second click in both cases.
 */
export function checkAdd(
  lines: { catalogCode?: string }[],
  entry: Pick<CatalogEntry, "code" | "kind">,
  baseCodes: ReadonlySet<string>
): AddCheck {
  if (lines.some((l) => l.catalogCode === entry.code)) return "duplicate";
  if (entry.kind === "base" && lines.some((l) => l.catalogCode && baseCodes.has(l.catalogCode))) return "second_base";
  return "ok";
}

/** Row from public.price_catalog_entries / price_catalog_current. */
export type CatalogRow = {
  code: string;
  version: number;
  kind: string;
  title: string;
  unit: string;
  price_cents: number | string | null;
  scope: string;
  includes: string;
  excludes: string;
  requires_review: boolean;
  active: boolean;
  position: number;
  created_at: string;
  created_by_email: string;
};

export function toCatalogEntry(r: CatalogRow): CatalogEntry {
  return {
    code: r.code,
    version: r.version,
    kind: (CATALOG_KINDS as readonly string[]).includes(r.kind) ? (r.kind as CatalogKind) : "manual",
    title: r.title,
    unit: r.unit,
    priceCents: r.price_cents === null ? null : Number(r.price_cents),
    scope: r.scope,
    includes: r.includes,
    excludes: r.excludes,
    requiresReview: r.requires_review,
    active: r.active,
    position: r.position,
    createdAt: r.created_at,
    createdByEmail: r.created_by_email,
  };
}
