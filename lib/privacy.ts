/**
 * Status of the privacy policy at /privacidad.
 *
 * While it is "borrador", the page is shown as a draft (noindex) and the quote
 * form stays disabled in Production. It only counts as final when the status
 * is "vigente", the effective date is set and nothing is left in PENDING.
 */
export const PRIVACY_POLICY = {
  // Text approved by the owner; in force from launch day (2026-11-04). Any
  // change to the text needs a new approval and a new effective date.
  status: "vigente" as "borrador" | "vigente",
  /** Date the reviewed text takes effect, "YYYY-MM-DD" (launch day). */
  effectiveDate: "2026-11-04" as string | null,
};

/**
 * Facts and decisions the text depends on that are not confirmed yet. Each one
 * is shown on the draft next to the paragraph it affects. Remove an entry only
 * once the text is updated with the confirmed answer. Empty: all confirmed.
 */
export const PRIVACY_PENDING = {} as Record<string, string>;

/** "4 de noviembre de 2026" for the effective date (no time zone shift). */
export function formatPolicyDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("es-PR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

/**
 * Facts the text relies on, confirmed on 2026-10-16. If any changes (plan,
 * PITR, Turnstile pre-clearance), update the text before changing this.
 * - Supabase PROD: Pro plan, daily physical backups kept 7 days, PITR off,
 *   logs kept 7 days.
 * - Vercel team: Hobby (runtime logs 1 hour); Pro keeps them 1 day. The text
 *   says "at most one day". Observability Plus (30 days) would need a change.
 * - Turnstile Production widget: pre-clearance off (no cf_clearance cookie).
 * - Contractual/accounting documents: no fixed period promised (approved wording).
 */
export const PRIVACY_FACTS = {
  supabaseBackupDays: 7,
  supabaseLogDays: 7,
};

export const privacyPolicyFinal = () =>
  PRIVACY_POLICY.status === "vigente" && Boolean(PRIVACY_POLICY.effectiveDate) && Object.keys(PRIVACY_PENDING).length === 0;

/** Operational commitments for requests about personal data (not legal claims). */
export const PRIVACY_REQUESTS = {
  acknowledgeBusinessDays: 5,
  resolveCalendarDays: 30,
};

/** Unconverted requests are deleted after this many months without documented commercial activity. */
export const PROSPECT_RETENTION_MONTHS = 12;
