import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalogLine, checkAdd, toCatalogEntry } from "@/lib/admin/catalog";
import { parseDraftSave } from "@/lib/admin/draft";
import { computeTotals, decimalToHundredths } from "@/lib/admin/money";
import { CATALOG } from "./catalog-fixture";

const REQUEST_ID = "3f1c2b8e-6a1d-4c2e-9f3b-1a2b3c4d5e6f";
const entry = (code: string) => CATALOG.find((e) => e.code === code)!;
const BASES = new Set(CATALOG.filter((e) => e.kind === "base").map((e) => e.code));

const save = (items: unknown[]) =>
  parseDraftSave({
    requestId: REQUEST_ID,
    expectedVersion: 3,
    draft: { title: "", summary: "", deliverables: "", exclusions: "", estimatedTime: "", terms: "", validity: "" },
    items,
  });

describe("adding catalog lines", () => {
  it("builds an editable line with the catalog price and the suggestion reason", () => {
    expect(catalogLine(entry("base_landing"), { reason: "Servicio solicitado" })).toEqual({
      description: "base_landing",
      quantity: "1",
      unitPrice: "650.00",
      catalogCode: "base_landing",
      catalogVersion: 1,
      suggestionReason: "Servicio solicitado",
      adjustmentNote: "",
    });
    // Manual evaluation: no price preloaded.
    expect(catalogLine(entry("manual_logo")).unitPrice).toBe("");
    expect(catalogLine(entry("seccion_adicional"), { quantity: 2 }).quantity).toBe("2");
  });

  it("flags accidental duplicates and a second base service, never existing manual lines", () => {
    const lines = [{ catalogCode: "base_landing" }, { catalogCode: "galeria" }, {}];
    expect(checkAdd(lines, entry("galeria"), BASES)).toBe("duplicate");
    expect(checkAdd(lines, entry("base_informativa"), BASES)).toBe("second_base");
    expect(checkAdd(lines, entry("formulario"), BASES)).toBe("ok");
    expect(checkAdd([{}, {}], entry("base_landing"), BASES)).toBe("ok");
  });

  it("maps database rows, keeping money in integer cents", () => {
    const e = toCatalogEntry({
      code: "galeria", version: 2, kind: "adicional", title: "Galería", unit: "galería", price_cents: "10000",
      scope: "", includes: "", excludes: "", requires_review: false, active: true, position: 1,
      created_at: "2026-11-03T00:00:00Z", created_by_email: "a@example.com",
    });
    expect(e.priceCents).toBe(10000);
    expect(Number.isInteger(e.priceCents)).toBe(true);
  });
});

describe("saving drafts with catalog lines", () => {
  it("sends catalog code, version, reason and adjustment note to the database function", () => {
    const r = save([
      { ...catalogLine(entry("base_landing"), { reason: "Servicio solicitado" }), unitPrice: "700", adjustmentNote: " Más secciones " },
      { description: "Partida libre", quantity: "1", unitPrice: "50" },
    ]);
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.payload.p_items).toEqual([
      {
        description: "base_landing", quantity: "1.00", unitPriceCents: 70000,
        catalogCode: "base_landing", catalogVersion: 1, suggestionReason: "Servicio solicitado", adjustmentNote: "Más secciones",
      },
      {
        description: "Partida libre", quantity: "1.00", unitPriceCents: 5000,
        catalogCode: null, catalogVersion: null, suggestionReason: null, adjustmentNote: null,
      },
    ]);
  });

  it("rejects malformed catalog references before calling the database", () => {
    expect(save([{ description: "x", quantity: "1", unitPrice: "1", catalogCode: "base_landing" }]).ok).toBe(false);
    expect(save([{ description: "x", quantity: "1", unitPrice: "1", catalogCode: "DROP TABLE", catalogVersion: 1 }]).ok).toBe(false);
    expect(save([{ description: "x", quantity: "1", unitPrice: "1", catalogCode: "galeria", catalogVersion: 0 }]).ok).toBe(false);
    expect(save([{ description: "x", quantity: "1", unitPrice: "1", catalogCode: "galeria", catalogVersion: 1, adjustmentNote: "x".repeat(501) }]).ok).toBe(false);
  });

  it("totals catalog lines with the same cent arithmetic as any line", () => {
    const r = save([
      catalogLine(entry("base_landing")),
      catalogLine(entry("seccion_adicional"), { quantity: 2 }),
      catalogLine(entry("galeria")),
    ]);
    if (!r.ok) throw new Error(r.errors.join());
    const totals = computeTotals(
      r.payload.p_items.map((i) => ({
        description: i.description,
        quantityHundredths: i.quantity === null ? null : decimalToHundredths(i.quantity),
        unitPriceCents: i.unitPriceCents,
      }))
    );
    expect(totals).toMatchObject({ totalCents: 65000 + 2 * 7500 + 10000, incomplete: false });
  });
});

describe("initial catalog", () => {
  it("seeds the agreed prices in cents, with no price for manual evaluations", () => {
    const sql = readFileSync(
      `supabase/migrations/${readdirSync("supabase/migrations").find((f) => f.endsWith("_price_catalog.sql"))}`,
      "utf8"
    );
    const seeded = new Map(
      [...sql.matchAll(/\('([a-z_]+)', '(base|adicional|manual)', '[^']*', '[^']*', (\d+|null)(?:::bigint)?,/g)].map((m) => [
        m[1],
        m[3] === "null" ? null : Number(m[3]),
      ])
    );
    expect(seeded.size).toBe(CATALOG.length);
    for (const e of CATALOG) expect(seeded.get(e.code), e.code).toBe(e.priceCents);
  });
});
