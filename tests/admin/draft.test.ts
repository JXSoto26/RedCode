import { describe, expect, it } from "vitest";
import { parseDraftSave, pendingFields, toEditorItems, type StoredDraft } from "@/lib/admin/draft";

const REQUEST_ID = "3f1c2b8e-6a1d-4c2e-9f3b-1a2b3c4d5e6f";
const emptyText = { title: "", summary: "", deliverables: "", exclusions: "", estimatedTime: "", terms: "", validity: "" };

const save = (overrides: Record<string, unknown> = {}) =>
  parseDraftSave({ requestId: REQUEST_ID, expectedVersion: 3, draft: emptyText, items: [], ...overrides });

describe("parseDraftSave", () => {
  it("accepts an empty, incomplete draft", () => {
    const r = save({ expectedVersion: null });
    expect(r).toEqual({
      ok: true,
      payload: { p_request_id: REQUEST_ID, p_expected_version: null, p_draft: emptyText, p_items: [] },
    });
  });

  it("normalizes items: exact quantities and cents, blanks as pending, empty rows dropped", () => {
    const r = save({
      items: [
        { description: " Diseño ", quantity: "1.5", unitPrice: "$1,250.50" },
        { description: "Sin precio", quantity: "2", unitPrice: "" },
        { description: "", quantity: "", unitPrice: "" },
      ],
    });
    expect(r.ok && r.payload.p_items).toEqual([
      { description: "Diseño", quantity: "1.50", unitPriceCents: 125_050 },
      { description: "Sin precio", quantity: "2.00", unitPriceCents: null },
    ]);
  });

  it("rejects invalid amounts with the item number", () => {
    const r = save({ items: [{ description: "x", quantity: "-1", unitPrice: "12.345" }] });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors).toEqual([
      "Partida 1: la cantidad debe ser mayor que 0, con hasta 2 decimales.",
      "Partida 1: el precio debe ser un importe en USD, con hasta 2 decimales.",
    ]);
  });

  it("rejects malformed envelopes, oversize text and too many items", () => {
    expect(save({ requestId: "nope" }).ok).toBe(false);
    expect(save({ expectedVersion: 0 }).ok).toBe(false);
    expect(save({ draft: { ...emptyText, title: "x".repeat(201) } }).ok).toBe(false);
    expect(save({ draft: { ...emptyText, extra: 1, title: 5 } }).ok).toBe(false);
    const item = { description: "x", quantity: "1", unitPrice: "1" };
    expect(save({ items: Array.from({ length: 51 }, () => item) }).ok).toBe(false);
    expect(parseDraftSave("not an object").ok).toBe(false);
  });

  it("does not invent prices, taxes, deposits or terms", () => {
    const r = save({ expectedVersion: null });
    expect(r.ok && Object.values(r.payload.p_draft).every((v) => v === "")).toBe(true);
    expect(r.ok && r.payload.p_items).toEqual([]);
  });
});

const stored = (overrides: Partial<StoredDraft> = {}): StoredDraft => ({
  id: "d",
  version: 1,
  title: "Título",
  summary: "Resumen",
  deliverables: "Entregable",
  exclusions: "Exclusión",
  estimatedTime: null,
  terms: null,
  validity: null,
  updatedAt: "2026-10-15T00:00:00Z",
  items: [{ id: "i", description: "Diseño", quantityHundredths: 100, unitPriceCents: 1000 }],
  ...overrides,
});

describe("pendingFields", () => {
  it("lists every required part when there is no draft", () => {
    expect(pendingFields(null)).toEqual(["Título", "Resumen y alcance", "Entregables", "Exclusiones", "Partidas"]);
  });

  it("is empty for a complete draft; optional fields are never pending", () => {
    expect(pendingFields(stored())).toEqual([]);
  });

  it("names missing fields and incomplete items", () => {
    expect(
      pendingFields(
        stored({
          summary: null,
          items: [{ id: "i", description: null, quantityHundredths: 100, unitPriceCents: null }],
        })
      )
    ).toEqual(["Resumen y alcance", "Partida 1: descripción, precio"]);
  });

  it("shows stored values back in the editor exactly", () => {
    expect(
      toEditorItems(
        stored({
          items: [
            { id: "a", description: "A", quantityHundredths: 150, unitPriceCents: 125_050 },
            { id: "b", description: null, quantityHundredths: 300, unitPriceCents: null },
          ],
        })
      )
    ).toEqual([
      { description: "A", quantity: "1.50", unitPrice: "1250.50" },
      { description: "", quantity: "3", unitPrice: "" },
    ]);
  });
});
