/**
 * Status of the privacy policy at /privacidad.
 *
 * While it is "borrador", the page is shown as a draft (noindex) and the quote
 * form stays disabled in Production: launching requires the reviewed text and
 * the retention decisions. Change to "vigente" (with the date) only after that.
 */
export const PRIVACY_POLICY = {
  status: "borrador" as "borrador" | "vigente",
  /** Date the reviewed text takes effect, "YYYY-MM-DD". */
  effectiveDate: null as string | null,
};

export const privacyPolicyFinal = () => PRIVACY_POLICY.status === "vigente" && Boolean(PRIVACY_POLICY.effectiveDate);
