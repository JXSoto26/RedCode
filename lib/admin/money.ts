/**
 * Money for quote drafts. Amounts are integer USD cents and quantities are
 * integer hundredths (1.5 → 150), so no arithmetic ever touches floating point.
 * Shared by the server (totals) and the editor (input parsing).
 */

// BigInt() instead of 100n literals: tsconfig targets ES2017.
const B50 = BigInt(50);
const B100 = BigInt(100);

export const MAX_UNIT_PRICE_CENTS = 100_000_000; // $1,000,000.00
export const MAX_QUANTITY_HUNDREDTHS = 10_000_000; // 100,000.00

/**
 * Parses a USD amount typed by a person ("1,250", "$99.5", "0.10") into cents.
 * Returns null for an empty input and undefined when it is not a valid amount.
 */
export function parseUsdToCents(input: string): number | null | undefined {
  const compact = input.trim().replace(/[$,\s]/g, "");
  if (compact === "") return null;
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(compact);
  if (!match) return undefined;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return cents <= MAX_UNIT_PRICE_CENTS ? cents : undefined;
}

/**
 * Parses a quantity with up to two decimals ("2", "1.5", "0.25") into
 * hundredths. Must be greater than zero. Null when empty, undefined if invalid.
 */
export function parseQuantity(input: string): number | null | undefined {
  const compact = input.trim().replace(/,/g, "");
  if (compact === "") return null;
  const match = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(compact);
  if (!match) return undefined;
  const hundredths = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return hundredths > 0 && hundredths <= MAX_QUANTITY_HUNDREDTHS ? hundredths : undefined;
}

/** Hundredths → the decimal string stored in numeric(10,2) ("150" → "1.50"). */
export function hundredthsToDecimal(hundredths: number): string {
  const whole = Math.trunc(hundredths / 100);
  const fraction = String(hundredths % 100).padStart(2, "0");
  return `${whole}.${fraction}`;
}

/** Decimal string from the database ("1.50", "2") → hundredths. */
export function decimalToHundredths(value: string): number {
  const parsed = parseQuantity(value);
  if (parsed === null || parsed === undefined) throw new Error("invalid_quantity");
  return parsed;
}

/** quantity × unit price, rounded half-up to the cent. */
export function lineTotalCents(quantityHundredths: number, unitPriceCents: number): number {
  const product = BigInt(quantityHundredths) * BigInt(unitPriceCents);
  return Number((product + B50) / B100);
}

/** "$1,234.56" without going through floating point. */
export function formatCents(cents: number): string {
  const negative = cents < 0;
  const abs = BigInt(Math.abs(cents));
  const dollars = (abs / B100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const rest = (abs % B100).toString().padStart(2, "0");
  return `${negative ? "-" : ""}$${dollars}.${rest}`;
}

/** Cents → the plain value shown back in an input ("1250.5" style, 2 decimals). */
export function centsToInput(cents: number | null): string {
  if (cents === null) return "";
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export type MoneyItem = {
  description: string | null;
  quantityHundredths: number | null;
  unitPriceCents: number | null;
};

export type DraftTotals = {
  /** Sum of the complete items, in cents. */
  totalCents: number;
  /** Line totals in item order; null for items missing quantity or price. */
  lines: (number | null)[];
  /** True when some item lacks a quantity or a price (total is partial). */
  incomplete: boolean;
};

export function computeTotals(items: MoneyItem[]): DraftTotals {
  let total = BigInt(0);
  let incomplete = false;
  const lines = items.map((item) => {
    if (item.quantityHundredths === null || item.unitPriceCents === null) {
      incomplete = true;
      return null;
    }
    const line = lineTotalCents(item.quantityHundredths, item.unitPriceCents);
    total += BigInt(line);
    return line;
  });
  return { totalCents: Number(total), lines, incomplete };
}
