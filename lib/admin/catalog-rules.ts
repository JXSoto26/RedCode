import type { QuoteRequestData } from "@/lib/quote/schema";
import { SECTIONS, labelFor } from "@/lib/quote/options";
import type { CatalogEntry } from "./catalog";

/**
 * Deterministic suggestions for a quote draft, from the request's answers.
 *
 * - Nothing is added automatically: the admin adds each line on purpose.
 * - Every suggestion has a stable rule id and a readable reason, so the
 *   result can be explained (and later compared with any assistant).
 * - The visitor's budget is never read: it cannot raise or lower prices.
 * - No discounts, taxes or recurring charges.
 *
 * kind:
 *   cargo     a line with a catalog price, ready to add
 *   revision  needs a manual decision (no price, or price to confirm)
 *   incluido  already covered by the base package: no charge
 *   nota      context for the admin, no line
 */
export type SuggestionKind = "cargo" | "revision" | "incluido" | "nota";

export type Suggestion = {
  rule: string;
  kind: SuggestionKind;
  /** Catalog entry to add; null for "incluido" and "nota". */
  code: string | null;
  quantity: number;
  reason: string;
};

/** Sections included by each base service. */
export const INCLUDED = { landingSections: 6, pages: 5 } as const;

const BASE_FOR_SERVICE = {
  landing_page: "base_landing",
  pagina_informativa: "base_informativa",
  rediseno: "base_rediseno",
  orientacion: "base_orientacion",
} as const;

const clip = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function suggestForRequest(data: QuoteRequestData, catalog: CatalogEntry[]): Suggestion[] {
  const active = new Map(catalog.filter((e) => e.active).map((e) => [e.code, e]));
  const out: Suggestion[] = [];

  /** A line suggestion, downgraded to a note if the entry is inactive or missing. */
  const line = (rule: string, code: string, quantity: number, reason: string, review = false) => {
    const entry = active.get(code);
    if (!entry) {
      out.push({ rule, kind: "nota", code: null, quantity: 0, reason: `${reason} (El elemento del catálogo está desactivado.)` });
      return;
    }
    const kind = review || entry.requiresReview || entry.priceCents === null ? "revision" : "cargo";
    out.push({ rule, kind, code, quantity, reason });
  };
  const info = (rule: string, kind: "incluido" | "nota", reason: string) =>
    out.push({ rule, kind, code: null, quantity: 0, reason });

  // 1. Base service.
  const service = data.service;
  const baseCode = BASE_FOR_SERVICE[service];
  if (service === "rediseno") {
    line("base_servicio", baseCode, 1,
      `Pidió un rediseño${data.currentUrl ? ` de ${data.currentUrl}` : ""}. El precio es una referencia inicial: revisa la página actual antes de confirmarlo.`);
  } else if (service === "orientacion") {
    line("base_servicio", baseCode, 1, "Pidió orientación: define el servicio con el cliente antes de poner un precio.");
  } else {
    line("base_servicio", baseCode, 1, `Servicio solicitado: ${service === "landing_page" ? "landing page" : "página informativa"}.`);
  }

  // 2. Sections against what the base includes. Orientation has no package yet.
  const sections = data.sections;
  const n = sections.length;
  if (n > 0 && service === "landing_page") {
    const extra = n - INCLUDED.landingSections;
    if (extra > 0) {
      line("secciones_extra", "seccion_adicional", extra,
        `Pidió ${n} secciones y la landing page incluye ${INCLUDED.landingSections}: ${extra} adicional${extra === 1 ? "" : "es"}.`);
    } else {
      info("secciones_incluidas", "incluido", `Las ${n} secciones pedidas caben en las ${INCLUDED.landingSections} incluidas en la landing page.`);
    }
  } else if (n > 0 && (service === "pagina_informativa" || service === "rediseno")) {
    if (n > INCLUDED.pages) {
      line("paginas_extra", "pagina_adicional", n - INCLUDED.pages,
        `Pidió ${n} secciones y el paquete incluye hasta ${INCLUDED.pages} páginas: decide si se agrupan en las páginas incluidas o si hacen falta páginas adicionales.`,
        true);
    } else {
      info("secciones_incluidas", "incluido", `Las ${n} secciones pedidas caben en las ${INCLUDED.pages} páginas incluidas.`);
    }
  }

  // 3. Gallery: the section already counts above; the add-on covers the gallery itself.
  if (sections.includes("galeria")) {
    line("galeria", "galeria", 1, "Pidió galería de fotos: hasta 20 imágenes entregadas. La sección ya cuenta dentro de las incluidas.");
  }

  // 4. Products and events: static by default; editable only if asked, as CMS collections.
  const collections = (["productos", "eventos"] as const).filter((s) => sections.includes(s));
  const editable = data.features.includes("contenido_editable");
  if (editable) {
    if (collections.length > 0) {
      const names = collections.map((c) => labelFor(SECTIONS, c).toLowerCase());
      line("cms", "cms_basico", 1, `Pidió contenido editable: una colección editable (${names[0]}).`);
      if (collections.length > 1) {
        line("cms_coleccion_extra", "cms_coleccion", collections.length - 1, `Segunda colección editable (${names.slice(1).join(", ")}).`);
      }
      info("cms_sin_estaticos", "nota",
        "Lo que el cliente edita en el CMS no se cotiza además como catálogo o eventos estáticos. Las demás secciones siguen siendo estáticas: no generan colecciones.");
    } else {
      line("cms", "cms_basico", 1,
        "Pidió contenido editable, pero no secciones de productos ni eventos: confirma qué necesita editar (una colección).", true);
    }
  } else {
    if (collections.includes("productos")) {
      line("productos_estaticos", "catalogo_productos", 1, "Pidió productos: catálogo estático de hasta 10, sin carrito, pagos ni edición por el cliente.");
    }
    if (collections.includes("eventos")) {
      line("eventos_estaticos", "eventos", 1, "Pidió eventos o actividades: hasta 5, estáticos, sin administrador.");
    }
  }

  // 5. Features. WhatsApp and map are part of every base package.
  if (data.features.includes("formulario_contacto")) {
    line("formulario", "formulario", 1, "Pidió formulario de contacto: hasta 6 campos, con validación, antispam y envío por email.");
  }
  if (data.features.includes("enlace_whatsapp")) {
    info("whatsapp_incluido", "incluido", "Enlace a WhatsApp: incluido en el paquete base, sin cargo.");
  }
  if (data.features.includes("mapa")) {
    info("mapa_incluido", "incluido", "Mapa de ubicación: incluido en el paquete base, sin cargo.");
  }
  if (data.features.includes("otra")) {
    line("funcion_especial", "manual_especial", 1,
      `Otra funcionalidad indicada${data.featuresOther ? `: “${clip(data.featuresOther)}”` : ""}. Evaluar a mano.`, true);
  }

  // 6. Content the client needs help with: always a manual review, never a charge.
  if (data.logoStatus === "necesito_ayuda") {
    line("logo", "manual_logo", 1, "Necesita ayuda con el logo: evaluar a mano.", true);
  }
  if (data.copyStatus === "necesito_ayuda") {
    line("textos", "redaccion", 1, "Necesita ayuda con los textos: valora la redacción desde un brief.", true);
  } else if (data.copyStatus === "parcial") {
    line("textos", "edicion_textos", 1, "Tiene los textos en parte: valora la edición de los textos entregados.", true);
  }
  if (data.photosStatus === "necesito_ayuda") {
    line("fotos", "manual_fotografia", 1, "Necesita ayuda con las fotos: evaluar fotografía a mano.", true);
  } else if (data.photosStatus === "parcial") {
    line("fotos", "manual_fotografia", 1, "Tiene las fotos en parte: confirma si hace falta fotografía u optimización.", true);
  }

  return out;
}
