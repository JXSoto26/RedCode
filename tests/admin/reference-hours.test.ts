import { describe, expect, it } from "vitest";
import { originKey, type CatalogOrigin } from "@/lib/admin/catalog";
import { REFERENCE_RATE_CENTS, formatTenthsOfHour, referenceHours } from "@/lib/admin/reference-hours";

const origins: Record<string, CatalogOrigin> = {
  [originKey("base_landing", 2)]: { title: "Landing page", unit: "proyecto", kind: "base", priceCents: 120000 },
  [originKey("seccion_adicional", 2)]: { title: "Sección", unit: "sección", kind: "adicional", priceCents: 12500 },
  [originKey("manual_fotografia", 1)]: { title: "Fotografía", unit: "evaluación", kind: "manual", priceCents: null },
};
const line = (code: string | null, version: number | null, qtyHundredths: number | null, cents: number | null, id = code ?? "x") => ({
  id,
  description: "Partida",
  quantityHundredths: qtyHundredths,
  unitPriceCents: cents,
  catalogCode: code,
  catalogVersion: version,
});

describe("internal reference hours ($75/h)", () => {
  it("divides the subtotal of RedCode services by $75, in tenths of an hour", () => {
    expect(REFERENCE_RATE_CENTS).toBe(7500);
    const r = referenceHours(
      [line("base_landing", 2, 100, 120000), line("seccion_adicional", 2, 200, 12500, "s")],
      origins
    );
    // $1,450.00 / $75 = 19.33… → 19.3 h
    expect(r).toEqual({ status: "ok", serviceCents: 145000, tenthsOfHour: 193 });
    expect(formatTenthsOfHour(193)).toBe("19.3 h");
  });

  it("rounds half up with integer arithmetic", () => {
    const at = (cents: number) => referenceHours([line("base_landing", 2, 100, cents)], origins);
    expect(at(3750)).toMatchObject({ tenthsOfHour: 5 }); // exactly 0.5 h
    expect(at(3375)).toMatchObject({ tenthsOfHour: 5 }); // 0.45 h → 0.5
    expect(at(3374)).toMatchObject({ tenthsOfHour: 4 });
    expect(formatTenthsOfHour(5)).toBe("0.5 h");
  });

  it("stays pending when a line may be a third-party cost or an expense", () => {
    const manualLine = referenceHours([line("base_landing", 2, 100, 120000), line(null, null, 100, 2000, "hosting")], origins);
    expect(manualLine.status).toBe("pendiente");
    expect(manualLine.status === "pendiente" && manualLine.reasons[0]).toMatch(/1 partida añadida a mano/);

    const evaluation = referenceHours([line("base_landing", 2, 100, 120000), line("manual_fotografia", 1, 100, 30000, "f")], origins);
    expect(evaluation.status === "pendiente" && evaluation.reasons[0]).toMatch(/evaluación manual/);
  });

  it("stays pending for incomplete or empty drafts and unknown catalog origins", () => {
    expect(referenceHours([], origins).status).toBe("pendiente");
    expect(referenceHours([line("base_landing", 2, 100, null)], origins)).toMatchObject({
      status: "pendiente",
      reasons: ["Hay partidas sin cantidad o precio."],
    });
    expect(referenceHours([line("base_landing", 9, 100, 1000)], origins).status).toBe("pendiente");
  });
});
