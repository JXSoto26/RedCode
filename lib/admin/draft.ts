import { z } from "zod";
import { centsToInput, hundredthsToDecimal, parseQuantity, parseUsdToCents, type MoneyItem } from "./money";

/**
 * Quote draft fields. Every field is optional so an incomplete draft can be
 * saved; `pendingFields` lists what is still missing. Nothing here is
 * prefilled: no prices, taxes, deposits, deadlines or terms.
 */

export const DRAFT_LIMITS = {
  title: 200,
  summary: 5000,
  deliverables: 5000,
  exclusions: 5000,
  estimatedTime: 200,
  terms: 5000,
  validity: 200,
  itemDescription: 500,
  items: 50,
} as const;

/** Text fields as the editor sends them. */
export type DraftText = {
  title: string;
  summary: string;
  deliverables: string;
  exclusions: string;
  estimatedTime: string;
  terms: string;
  validity: string;
};

/** Item as typed in the editor: raw strings, parsed on the server. */
export type DraftItemInput = { description: string; quantity: string; unitPrice: string };

const text = (max: number, label: string) =>
  z.string().max(max, `${label}: máximo ${max} caracteres.`);

const draftTextSchema = z.object({
  title: text(DRAFT_LIMITS.title, "Título"),
  summary: text(DRAFT_LIMITS.summary, "Resumen y alcance"),
  deliverables: text(DRAFT_LIMITS.deliverables, "Entregables"),
  exclusions: text(DRAFT_LIMITS.exclusions, "Exclusiones"),
  estimatedTime: text(DRAFT_LIMITS.estimatedTime, "Tiempo estimado"),
  terms: text(DRAFT_LIMITS.terms, "Condiciones"),
  validity: text(DRAFT_LIMITS.validity, "Vigencia"),
});

const itemSchema = z.object({
  description: z.string().max(DRAFT_LIMITS.itemDescription),
  quantity: z.string().max(20),
  unitPrice: z.string().max(20),
});

const saveSchema = z.object({
  requestId: z.uuid(),
  // null = the draft does not exist yet.
  expectedVersion: z.number().int().min(1).nullable(),
  draft: draftTextSchema,
  items: z.array(itemSchema).max(DRAFT_LIMITS.items, `Máximo ${DRAFT_LIMITS.items} partidas.`),
});

/** Payload for public.admin_save_quote_draft (keys match the SQL function). */
export type DraftRpcPayload = {
  p_request_id: string;
  p_expected_version: number | null;
  p_draft: Record<keyof DraftText, string>;
  p_items: { description: string | null; quantity: string | null; unitPriceCents: number | null }[];
};

export type ParsedDraft =
  | { ok: true; payload: DraftRpcPayload }
  | { ok: false; errors: string[] };

/** Validates and normalizes a save request. Empty item rows are dropped. */
export function parseDraftSave(input: unknown): ParsedDraft {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: [...new Set(parsed.error.issues.map((i) => i.message))] };
  }
  const { requestId, expectedVersion, draft, items } = parsed.data;

  const errors: string[] = [];
  const rows: DraftRpcPayload["p_items"] = [];
  items.forEach((item, index) => {
    const description = item.description.trim();
    if (!description && !item.quantity.trim() && !item.unitPrice.trim()) return;
    const n = index + 1;
    const quantity = parseQuantity(item.quantity);
    const cents = parseUsdToCents(item.unitPrice);
    if (quantity === undefined) errors.push(`Partida ${n}: la cantidad debe ser mayor que 0, con hasta 2 decimales.`);
    if (cents === undefined) errors.push(`Partida ${n}: el precio debe ser un importe en USD, con hasta 2 decimales.`);
    rows.push({
      description: description || null,
      quantity: quantity == null ? null : hundredthsToDecimal(quantity),
      unitPriceCents: cents ?? null,
    });
  });
  if (errors.length) return { ok: false, errors };

  const trimmed = Object.fromEntries(
    Object.entries(draft).map(([k, v]) => [k, v.trim()])
  ) as Record<keyof DraftText, string>;

  return {
    ok: true,
    payload: { p_request_id: requestId, p_expected_version: expectedVersion, p_draft: trimmed, p_items: rows },
  };
}

/** Stored draft, as read from the database. */
export type StoredDraft = {
  id: string;
  version: number;
  title: string | null;
  summary: string | null;
  deliverables: string | null;
  exclusions: string | null;
  estimatedTime: string | null;
  terms: string | null;
  validity: string | null;
  updatedAt: string;
  items: (MoneyItem & { id: string })[];
};

/**
 * Required parts of a proposal that are still empty. Optional fields
 * (exclusions, time, terms, validity) are not listed.
 */
export function pendingFields(draft: StoredDraft | null): string[] {
  if (!draft) return ["Título", "Resumen y alcance", "Entregables", "Partidas"];
  const pending: string[] = [];
  if (!draft.title) pending.push("Título");
  if (!draft.summary) pending.push("Resumen y alcance");
  if (!draft.deliverables) pending.push("Entregables");
  if (draft.items.length === 0) pending.push("Partidas");
  draft.items.forEach((item, i) => {
    const missing = [
      !item.description && "descripción",
      item.quantityHundredths === null && "cantidad",
      item.unitPriceCents === null && "precio",
    ].filter(Boolean);
    if (missing.length) pending.push(`Partida ${i + 1}: ${missing.join(", ")}`);
  });
  return pending;
}

/** Editor rows for a stored draft (strings exactly as the inputs show them). */
export function toEditorItems(draft: StoredDraft | null): DraftItemInput[] {
  if (!draft) return [];
  return draft.items.map((item) => ({
    description: item.description ?? "",
    quantity:
      item.quantityHundredths === null ? "" : hundredthsToDecimal(item.quantityHundredths).replace(/\.00$/, ""),
    unitPrice: centsToInput(item.unitPriceCents),
  }));
}
