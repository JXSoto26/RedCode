import "server-only";
import { requireAdmin } from "./auth";
import { originKey, toCatalogEntry, type CatalogEntry, type CatalogKind, type CatalogOrigin, type CatalogRow } from "./catalog";

/**
 * Catalog reads for /admin. Each one checks the admin and queries as the
 * signed-in user (RLS: admins only). The catalog is never public.
 */

const COLUMNS =
  "code, version, kind, title, unit, price_cents, scope, includes, excludes, requires_review, active, position, created_at, created_by_email";

/** Latest version of every entry, active or not, in display order. */
export async function listCatalog(): Promise<CatalogEntry[]> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.from("price_catalog_current").select(COLUMNS).order("position");
  if (error) throw new Error(`catalog_failed:${error.code}`);
  return (data as CatalogRow[]).map(toCatalogEntry);
}

/**
 * Title and price of every version ever used, keyed "<code>@<version>", so
 * the editor can show the original value of an item even after the catalog
 * changed. The table is small (a few dozen rows).
 */
export async function catalogOrigins(): Promise<Record<string, CatalogOrigin>> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.from("price_catalog_entries").select("code, version, kind, title, unit, price_cents");
  if (error) throw new Error(`catalog_failed:${error.code}`);
  return Object.fromEntries(
    (data as { code: string; version: number; kind: CatalogKind; title: string; unit: string; price_cents: number | string | null }[]).map((r) => [
      originKey(r.code, r.version),
      { title: r.title, unit: r.unit, kind: r.kind, priceCents: r.price_cents === null ? null : Number(r.price_cents) },
    ])
  );
}
