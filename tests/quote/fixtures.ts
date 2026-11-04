import { EMPTY_FORM, type QuoteFormValues } from "@/lib/quote/schema";

/** Fixed "now" so date rules are deterministic: 2026-10-14 noon in Puerto Rico. */
export const NOW = new Date("2026-10-14T16:00:00Z");

export function validValues(overrides: Partial<QuoteFormValues> = {}): QuoteFormValues {
  return {
    ...EMPTY_FORM,
    contactName: "Ana Prueba",
    businessName: "Panadería de Prueba",
    email: "Ana@Example.com",
    whatsapp: "+1 (787) 555-0123",
    businessType: "pequeno_negocio",
    service: "pagina_informativa",
    goal: "Que mis clientes vean el menú y me escriban.",
    logoStatus: "disponible",
    copyStatus: "parcial",
    photosStatus: "necesito_ayuda",
    consent: true,
    ...overrides,
  };
}
