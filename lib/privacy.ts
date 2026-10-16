/**
 * Status of the privacy policy at /privacidad.
 *
 * While it is "borrador", the page is shown as a draft (noindex) and the quote
 * form stays disabled in Production. It only counts as final when the status
 * is "vigente", the effective date is set and nothing is left in PENDING.
 */
export const PRIVACY_POLICY = {
  status: "borrador" as "borrador" | "vigente",
  /** Date the reviewed text takes effect, "YYYY-MM-DD" (launch day). */
  effectiveDate: null as string | null,
};

/**
 * Facts and decisions the text depends on that are not confirmed yet. Each one
 * is shown on the draft next to the paragraph it affects. Remove an entry only
 * once the text is updated with the confirmed answer.
 */
export const PRIVACY_PENDING = {
  accounting: "Plazo de conservación de documentos contractuales y contables: pendiente de confirmar con tu contador.",
  supabasePlan:
    "Plan de Supabase de producción: de él depende si hay copias de seguridad de la base de datos y cuántos días duran (Free: ninguna; Pro: 7 días; Team: 14).",
  turnstile:
    "Cloudflare no detalla en la documentación consultada qué cookies o almacenamiento usa Turnstile ni cuánto conserva los datos de la verificación.",
  vercelLogs: "No está confirmado si los registros técnicos de Vercel incluyen la dirección IP del visitante.",
  review: "Revisión final del texto por Jeremy (y, si lo considera necesario, por un asesor legal).",
} as Record<string, string>;

export const privacyPolicyFinal = () =>
  PRIVACY_POLICY.status === "vigente" && Boolean(PRIVACY_POLICY.effectiveDate) && Object.keys(PRIVACY_PENDING).length === 0;

/** Operational commitments for requests about personal data (not legal claims). */
export const PRIVACY_REQUESTS = {
  acknowledgeBusinessDays: 5,
  resolveCalendarDays: 30,
};

/** Unconverted requests are deleted after this many months without documented commercial activity. */
export const PROSPECT_RETENTION_MONTHS = 12;
