/**
 * Central business data for RedCode Web Design Studio.
 *
 * Fields left as `null` (or empty arrays) are pending confirmation. Anything
 * that depends on them — contact buttons, social links, sitemap, canonical
 * URLs — stays hidden until a real value is filled in here.
 */
export const site = {
  name: "RedCode Web Design Studio",
  shortName: "RedCode",
  owner: "Jeremy Soto",
  location: "Puerto Rico",

  /** Public domain, e.g. "https://example.com". Pending confirmation. */
  url: null as string | null,

  contact: {
    /** Public email address. Pending confirmation. */
    email: null as string | null,
    /** WhatsApp number in international format, digits only (e.g. "1787XXXXXXX"). Pending confirmation. */
    whatsapp: null as string | null,
  },

  /** Public social profiles. Pending confirmation. */
  socials: [] as { label: string; href: string }[],
};

const QUOTE_MESSAGE =
  "Hola, me interesa una cotización para una página web con RedCode Web Design Studio.";

export const whatsappHref = site.contact.whatsapp
  ? `https://wa.me/${site.contact.whatsapp}?text=${encodeURIComponent(QUOTE_MESSAGE)}`
  : null;

export const emailHref = site.contact.email
  ? `mailto:${site.contact.email}?subject=${encodeURIComponent("Cotización de página web")}`
  : null;

/** True once at least one public contact method is configured. */
export const hasContact = Boolean(whatsappHref || emailHref);

/**
 * Where "Solicita una cotización" leads: the quote form when submissions are
 * enabled (server config), else direct contact, else nowhere (CTA hidden).
 */
export function quoteCtaHref(quoteEnabled: boolean) {
  if (quoteEnabled) return "/cotizar";
  return hasContact ? "/#contacto" : null;
}
