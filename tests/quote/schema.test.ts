import { describe, expect, it } from "vitest";
import { BUDGET_MAX_USD, CONSENT_VERSION, LIMITS } from "@/lib/quote/options";
import { EMPTY_FORM, errorsForStep, firstStepWithError, parseQuoteRequest } from "@/lib/quote/schema";
import { NOW, validValues } from "./fixtures";

const parse = (overrides = {}) => parseQuoteRequest(validValues(overrides), NOW);
const errorsOf = (overrides = {}) => {
  const r = parse(overrides);
  return r.success ? {} : r.fieldErrors;
};

describe("parseQuoteRequest (server validation)", () => {
  it("accepts a complete request and normalizes it", () => {
    const r = parse({ currentUrl: "minegocio.com", sections: ["inicio", "inicio", "contacto"] });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.email).toBe("ana@example.com");
    expect(r.data.whatsapp).toBe("+17875550123");
    expect(r.data.currentUrl).toBe("https://minegocio.com/");
    expect(r.data.sections).toEqual(["inicio", "contacto"]);
    expect(r.data.consentVersion).toBe(CONSENT_VERSION);
    expect(r.data.redesignImprovements).toBeNull();
  });

  it("requires the mandatory fields", () => {
    const r = parseQuoteRequest({ ...EMPTY_FORM }, NOW);
    expect(r.success).toBe(false);
    if (r.success) return;
    for (const key of ["contactName", "businessName", "email", "businessType", "service", "goal", "logoStatus", "copyStatus", "photosStatus", "consent"]) {
      expect(r.fieldErrors, key).toHaveProperty(key);
    }
    expect(r.fieldErrors).not.toHaveProperty("whatsapp");
    expect(r.fieldErrors).not.toHaveProperty("budgetUsd");
  });

  it("rejects whitespace-only required text", () => {
    expect(errorsOf({ contactName: "   " })).toHaveProperty("contactName");
  });

  it("enforces length limits after trimming", () => {
    expect(errorsOf({ goal: "a".repeat(LIMITS.goal) })).not.toHaveProperty("goal");
    expect(errorsOf({ goal: "a".repeat(LIMITS.goal + 1) })).toHaveProperty("goal");
    expect(errorsOf({ comments: "x".repeat(LIMITS.comments * 3) })).toHaveProperty("comments");
  });

  it("only accepts allowed option values", () => {
    expect(errorsOf({ service: "tienda_online" as never })).toHaveProperty("service");
    expect(errorsOf({ sections: ["inicio", "blog"] as never })).toHaveProperty("sections");
    expect(errorsOf({ features: ["ia"] as never })).toHaveProperty("features");
    expect(errorsOf({ logoStatus: "quizas" as never })).toHaveProperty("logoStatus");
  });

  it("rejects non-object and wrongly typed payloads", () => {
    expect(parseQuoteRequest("hola", NOW).success).toBe(false);
    expect(parseQuoteRequest(null, NOW).success).toBe(false);
    expect(errorsOf({ sections: "inicio" as never })).toHaveProperty("sections");
    expect(errorsOf({ consent: "true" as never })).toHaveProperty("consent");
  });

  it("validates email and WhatsApp formats", () => {
    expect(errorsOf({ email: "ana@" })).toHaveProperty("email");
    expect(errorsOf({ whatsapp: "787 555 0123" })).toHaveProperty("whatsapp");
    expect(errorsOf({ whatsapp: "+1 787 555 0123" })).not.toHaveProperty("whatsapp");
    expect(errorsOf({ whatsapp: "" })).not.toHaveProperty("whatsapp");
  });

  it("requires the 'Otro' description only when 'Otro' is chosen", () => {
    expect(errorsOf({ businessType: "otro" })).toHaveProperty("businessTypeOther");
    const r = parse({ businessType: "iglesia", businessTypeOther: "ignored" });
    expect(r.success && r.data.businessTypeOther).toBeNull();
    expect(errorsOf({ sections: ["otra"] })).toHaveProperty("sectionsOther");
    expect(errorsOf({ features: ["otra"] })).toHaveProperty("featuresOther");
  });

  it("requires current URL and improvements for a redesign", () => {
    const e = errorsOf({ service: "rediseno" });
    expect(e).toHaveProperty("currentUrl");
    expect(e).toHaveProperty("redesignImprovements");
    expect(parse({ service: "rediseno", currentUrl: "https://viejo.com", redesignImprovements: "Se ve anticuada." }).success).toBe(true);
    expect(errorsOf({ currentUrl: "javascript:alert(1)" })).toHaveProperty("currentUrl");
    expect(errorsOf({ currentUrl: "no es una url" })).toHaveProperty("currentUrl");
  });

  it("validates the optional budget as whole USD within range", () => {
    expect(parse({ budgetUsd: "1,500" }).success && true).toBe(true);
    expect(errorsOf({ budgetUsd: "12.50" })).toHaveProperty("budgetUsd");
    expect(errorsOf({ budgetUsd: "0" })).toHaveProperty("budgetUsd");
    expect(errorsOf({ budgetUsd: String(BUDGET_MAX_USD + 1) })).toHaveProperty("budgetUsd");
    const undefinedBudget = parse({ budgetUsd: "999", budgetUndefined: true });
    expect(undefinedBudget.success && undefinedBudget.data.budgetUsd).toBeNull();
  });

  it("validates the optional date against Puerto Rico's today", () => {
    expect(errorsOf({ desiredDate: "2026-10-13" })).toHaveProperty("desiredDate");
    expect(errorsOf({ desiredDate: "2026-10-14" })).not.toHaveProperty("desiredDate");
    expect(errorsOf({ desiredDate: "2026-02-30" })).toHaveProperty("desiredDate");
    expect(errorsOf({ desiredDate: "2030-01-01" })).toHaveProperty("desiredDate");
    const noDate = parse({ desiredDate: "2020-01-01", dateUndefined: true });
    expect(noDate.success && noDate.data.desiredDate).toBeNull();
  });

  it("requires consent with the current text version", () => {
    expect(errorsOf({ consent: false })).toHaveProperty("consent");
    expect(errorsOf({ consentVersion: "2020-01-01" })).toHaveProperty("consent");
  });

  it("groups errors by step", () => {
    const r = parseQuoteRequest({ ...EMPTY_FORM, contactName: "Ana" }, NOW);
    if (r.success) throw new Error("expected errors");
    expect(Object.keys(errorsForStep(r.fieldErrors, 1))).not.toContain("goal");
    expect(firstStepWithError(r.fieldErrors)).toBe(1);
    expect(firstStepWithError({ consent: "x" })).toBe(4);
  });
});
