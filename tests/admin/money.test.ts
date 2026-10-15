import { describe, expect, it } from "vitest";
import {
  centsToInput,
  computeTotals,
  decimalToHundredths,
  formatCents,
  hundredthsToDecimal,
  lineTotalCents,
  parseQuantity,
  parseUsdToCents,
} from "@/lib/admin/money";

describe("parseUsdToCents", () => {
  it("parses amounts as people type them", () => {
    expect(parseUsdToCents("1250")).toBe(125_000);
    expect(parseUsdToCents("$1,250.50")).toBe(125_050);
    expect(parseUsdToCents("99.5")).toBe(9_950);
    expect(parseUsdToCents("0.10")).toBe(10);
    expect(parseUsdToCents(" 0 ")).toBe(0);
  });

  it("returns null when empty and undefined when invalid", () => {
    expect(parseUsdToCents("")).toBeNull();
    expect(parseUsdToCents("   ")).toBeNull();
    for (const bad of ["abc", "1.234", "-5", "1e3", "12.", ".5", "1,000,000.01", "99999999"]) {
      expect(parseUsdToCents(bad), bad).toBeUndefined();
    }
  });
});

describe("parseQuantity", () => {
  it("accepts up to two decimals, greater than zero", () => {
    expect(parseQuantity("2")).toBe(200);
    expect(parseQuantity("1.5")).toBe(150);
    expect(parseQuantity("0.25")).toBe(25);
    expect(parseQuantity("")).toBeNull();
    for (const bad of ["0", "0.00", "-1", "1.005", "x", "100000.01"]) {
      expect(parseQuantity(bad), bad).toBeUndefined();
    }
  });

  it("round-trips the decimal stored in the database", () => {
    expect(hundredthsToDecimal(150)).toBe("1.50");
    expect(hundredthsToDecimal(5)).toBe("0.05");
    expect(decimalToHundredths("1.50")).toBe(150);
    expect(decimalToHundredths("3")).toBe(300);
  });
});

describe("totals", () => {
  it("avoids floating point errors", () => {
    // 0.1 + 0.2 !== 0.3 in floating point; in cents it is exact.
    const t = computeTotals([
      { description: "a", quantityHundredths: 100, unitPriceCents: 10 },
      { description: "b", quantityHundredths: 100, unitPriceCents: 20 },
    ]);
    expect(t.totalCents).toBe(30);
    expect(formatCents(t.totalCents)).toBe("$0.30");

    // 3 × 19.99 = 59.97 exactly (floating point gives 59.97000000000001).
    expect(lineTotalCents(300, 1999)).toBe(5997);
  });

  it("rounds each line half-up to the cent", () => {
    expect(lineTotalCents(150, 1999)).toBe(2999); // 29.985 → 29.99
    expect(lineTotalCents(33, 1)).toBe(0); // 0.0033 → 0.00
    expect(lineTotalCents(50, 1)).toBe(1); // 0.005 → 0.01
  });

  it("handles large amounts exactly", () => {
    expect(lineTotalCents(10_000_000, 100_000_000)).toBe(10_000_000_000_000);
    expect(formatCents(10_000_000_000_000)).toBe("$100,000,000,000.00");
  });

  it("marks the total as partial when items lack quantity or price", () => {
    const t = computeTotals([
      { description: "ok", quantityHundredths: 200, unitPriceCents: 5000 },
      { description: "sin precio", quantityHundredths: 100, unitPriceCents: null },
      { description: null, quantityHundredths: null, unitPriceCents: 100 },
    ]);
    expect(t).toEqual({ totalCents: 10_000, lines: [10_000, null, null], incomplete: true });
    expect(computeTotals([])).toEqual({ totalCents: 0, lines: [], incomplete: false });
  });

  it("formats cents for display and inputs", () => {
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(123_456_789)).toBe("$1,234,567.89");
    expect(centsToInput(125_050)).toBe("1250.50");
    expect(centsToInput(null)).toBe("");
  });
});
