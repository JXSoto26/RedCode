/**
 * Allowed values for the quote request form. Shared by the client form, the
 * server validation and the email templates. The database migration mirrors
 * these lists in CHECK constraints — keep them in sync (a test enforces it).
 */

export const BUSINESS_TYPES = [
  { value: "pequeno_negocio", label: "Pequeño negocio" },
  { value: "profesional_independiente", label: "Profesional independiente" },
  { value: "iglesia", label: "Iglesia" },
  { value: "otro", label: "Otro" },
] as const;

export const SERVICES = [
  {
    value: "pagina_informativa",
    label: "Página informativa",
    hint: "Para presentar tu negocio u organización.",
  },
  {
    value: "landing_page",
    label: "Landing page",
    hint: "Una página enfocada en un servicio, producto o campaña.",
  },
  {
    value: "rediseno",
    label: "Rediseño",
    hint: "Ya tienes una página y quieres renovarla.",
  },
  {
    value: "orientacion",
    label: "Necesito orientación",
    hint: "No tienes claro qué tipo de página te conviene.",
  },
] as const;

export const SECTIONS = [
  { value: "inicio", label: "Inicio" },
  { value: "sobre_nosotros", label: "Sobre nosotros" },
  { value: "servicios", label: "Servicios" },
  { value: "productos", label: "Productos" },
  { value: "galeria", label: "Galería de fotos" },
  { value: "horarios", label: "Horarios" },
  { value: "eventos", label: "Eventos o actividades" },
  { value: "preguntas_frecuentes", label: "Preguntas frecuentes" },
  { value: "contacto", label: "Contacto" },
  { value: "otra", label: "Otra" },
] as const;

export const FEATURES = [
  { value: "formulario_contacto", label: "Formulario de contacto" },
  { value: "enlace_whatsapp", label: "Enlace a WhatsApp" },
  { value: "mapa", label: "Mapa de ubicación" },
  { value: "contenido_editable", label: "Contenido que yo pueda editar" },
  { value: "otra", label: "Otra" },
] as const;

export const ASSET_STATUSES = [
  { value: "disponible", label: "Lo tengo" },
  { value: "parcial", label: "Lo tengo en parte" },
  { value: "necesito_ayuda", label: "Necesito ayuda" },
] as const;

export const ASSETS = [
  { field: "logoStatus", label: "Logo" },
  { field: "copyStatus", label: "Textos" },
  { field: "photosStatus", label: "Fotografías" },
] as const;

export const REQUEST_STATUSES = [
  "nueva",
  "por_aclarar",
  "propuesta_enviada",
  "aceptada",
  "cerrada",
] as const;

export const NOTIFICATION_STATUSES = [
  "pendiente",
  "enviado",
  "fallido",
  "omitido",
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number]["value"];
export type Service = (typeof SERVICES)[number]["value"];
export type Section = (typeof SECTIONS)[number]["value"];
export type Feature = (typeof FEATURES)[number]["value"];
export type AssetStatus = (typeof ASSET_STATUSES)[number]["value"];
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const values = <T extends readonly { value: string }[]>(list: T) =>
  list.map((o) => o.value) as unknown as [T[number]["value"], ...T[number]["value"][]];

export function labelFor(
  list: readonly { value: string; label: string }[],
  value: string | null | undefined
) {
  return list.find((o) => o.value === value)?.label ?? value ?? "";
}

/** Max lengths, shared by input `maxLength` attributes and server validation. */
export const LIMITS = {
  contactName: 100,
  businessName: 150,
  email: 254,
  whatsapp: 25,
  businessTypeOther: 100,
  goal: 1500,
  currentUrl: 300,
  redesignImprovements: 1500,
  sectionsOther: 200,
  featuresOther: 200,
  comments: 2000,
} as const;

export const BUDGET_MAX_USD = 1_000_000;

/**
 * Consent shown before submitting. Bump the version whenever the text changes;
 * the accepted version is stored with each request.
 */
export const CONSENT_VERSION = "2026-10-14";
export const CONSENT_TEXT =
  "Autorizo a RedCode Web Design Studio a usar los datos de este formulario para responder a mi solicitud de cotización.";
