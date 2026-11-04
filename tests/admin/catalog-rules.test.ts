import { describe, expect, it } from "vitest";
import { suggestForRequest, type Suggestion } from "@/lib/admin/catalog-rules";
import { parseQuoteRequest, type QuoteRequestData } from "@/lib/quote/schema";
import { NOW, validValues } from "../quote/fixtures";
import { CATALOG } from "./catalog-fixture";

function request(overrides: Parameters<typeof validValues>[0] = {}): QuoteRequestData {
  const parsed = parseQuoteRequest(
    validValues({
      sections: [],
      features: [],
      logoStatus: "disponible",
      copyStatus: "disponible",
      photosStatus: "disponible",
      ...overrides,
    }),
    NOW
  );
  if (!parsed.success) throw new Error(JSON.stringify(parsed.fieldErrors));
  return parsed.data;
}

const find = (s: Suggestion[], rule: string) => s.find((x) => x.rule === rule);
const codes = (s: Suggestion[]) => s.filter((x) => x.code).map((x) => `${x.kind}:${x.code}×${x.quantity}`);

describe("price suggestions", () => {
  it("suggests the base service of each request type", () => {
    expect(find(suggestForRequest(request({ service: "landing_page" }), CATALOG), "base_servicio")).toMatchObject({ kind: "cargo", code: "base_landing" });
    expect(find(suggestForRequest(request({ service: "pagina_informativa" }), CATALOG), "base_servicio")).toMatchObject({ kind: "cargo", code: "base_informativa" });
    // Redesign has a reference price but always needs a manual review.
    expect(
      find(suggestForRequest(request({ service: "rediseno", currentUrl: "https://ejemplo.com", redesignImprovements: "Más claro" }), CATALOG), "base_servicio")
    ).toMatchObject({ kind: "revision", code: "base_rediseno" });
    // Orientation: no automatic price.
    expect(find(suggestForRequest(request({ service: "orientacion" }), CATALOG), "base_servicio")).toMatchObject({ kind: "revision", code: "base_orientacion" });
  });

  it("charges only sections beyond the 6 included in a landing page", () => {
    const six = suggestForRequest(request({ service: "landing_page", sections: ["inicio", "servicios", "horarios", "contacto", "sobre_nosotros", "preguntas_frecuentes"] }), CATALOG);
    expect(find(six, "secciones_incluidas")?.kind).toBe("incluido");
    expect(six.some((s) => s.code === "seccion_adicional")).toBe(false);

    const eight = suggestForRequest(
      request({ service: "landing_page", sections: ["inicio", "servicios", "horarios", "contacto", "sobre_nosotros", "preguntas_frecuentes", "galeria", "otra"], sectionsOther: "Equipo" }),
      CATALOG
    );
    expect(find(eight, "secciones_extra")).toMatchObject({ kind: "cargo", code: "seccion_adicional", quantity: 2 });
  });

  it("never charges WhatsApp or the map: they are part of the base package", () => {
    const s = suggestForRequest(request({ service: "landing_page", features: ["enlace_whatsapp", "mapa"] }), CATALOG);
    expect(find(s, "whatsapp_incluido")).toMatchObject({ kind: "incluido", code: null });
    expect(find(s, "mapa_incluido")).toMatchObject({ kind: "incluido", code: null });
    expect(codes(s)).toEqual(["cargo:base_landing×1"]);
  });

  it("turns 'Necesito ayuda' with logo, texts or photos into reviews, never charges", () => {
    const s = suggestForRequest(
      request({ service: "landing_page", logoStatus: "necesito_ayuda", copyStatus: "necesito_ayuda", photosStatus: "necesito_ayuda" }),
      CATALOG
    );
    for (const rule of ["logo", "textos", "fotos"]) expect(find(s, rule)?.kind).toBe("revision");
    expect(s.filter((x) => x.kind === "cargo").map((x) => x.code)).toEqual(["base_landing"]);
  });

  it("keeps products and events static unless editable content is requested", () => {
    const staticOnly = suggestForRequest(request({ service: "landing_page", sections: ["productos", "eventos", "galeria"] }), CATALOG);
    expect(codes(staticOnly)).toEqual(["cargo:base_landing×1", "cargo:galeria×1", "cargo:catalogo_productos×1", "cargo:eventos×1"]);

    const editable = suggestForRequest(
      request({ service: "landing_page", sections: ["productos", "eventos", "galeria", "horarios"], features: ["contenido_editable"] }),
      CATALOG
    );
    // One collection in the CMS, one more for the second editable type; no CMS per static section.
    expect(codes(editable)).toEqual(["cargo:base_landing×1", "cargo:galeria×1", "cargo:cms_basico×1", "cargo:cms_coleccion×1"]);
    expect(editable.some((s) => s.code === "catalogo_productos" || s.code === "eventos")).toBe(false);
    expect(find(editable, "cms_sin_estaticos")?.kind).toBe("nota");
  });

  it("asks what to edit when editable content has no products or events", () => {
    const s = suggestForRequest(request({ service: "landing_page", features: ["contenido_editable"] }), CATALOG);
    expect(find(s, "cms")).toMatchObject({ kind: "revision", code: "cms_basico" });
  });

  it("suggests extra pages for an informational site only as a review", () => {
    const s = suggestForRequest(
      request({ service: "pagina_informativa", sections: ["inicio", "servicios", "horarios", "contacto", "sobre_nosotros", "preguntas_frecuentes", "otra"], sectionsOther: "Blog" }),
      CATALOG
    );
    expect(find(s, "paginas_extra")).toMatchObject({ kind: "revision", code: "pagina_adicional", quantity: 2 });
  });

  it("ignores the visitor's budget completely", () => {
    const base = { service: "landing_page" as const, sections: ["inicio", "galeria"] as QuoteRequestData["sections"], features: ["formulario_contacto"] as QuoteRequestData["features"] };
    const low = suggestForRequest(request({ ...base, budgetUsd: "100", budgetUndefined: false }), CATALOG);
    const high = suggestForRequest(request({ ...base, budgetUsd: "50000", budgetUndefined: false }), CATALOG);
    const none = suggestForRequest(request({ ...base, budgetUsd: "", budgetUndefined: true }), CATALOG);
    expect(high).toEqual(low);
    expect(none).toEqual(low);
  });

  it("never suggests a deactivated entry as a line", () => {
    const catalog = CATALOG.map((e) => (e.code === "formulario" ? { ...e, active: false } : e));
    const s = suggestForRequest(request({ service: "landing_page", features: ["formulario_contacto"] }), catalog);
    expect(find(s, "formulario")).toMatchObject({ kind: "nota", code: null });
  });

  it("gives every suggestion a reason and a stable rule id", () => {
    const s = suggestForRequest(
      request({ service: "landing_page", sections: ["productos", "galeria"], features: ["formulario_contacto", "mapa", "otra"], featuresOther: "Reservas", copyStatus: "parcial" }),
      CATALOG
    );
    for (const x of s) {
      expect(x.rule).toMatch(/^[a-z_]+$/);
      expect(x.reason.length).toBeGreaterThan(10);
    }
    expect(find(s, "funcion_especial")?.reason).toContain("Reservas");
  });
});
