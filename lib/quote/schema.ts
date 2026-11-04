import { z } from "zod";
import {
  ASSET_STATUSES,
  BUDGET_MAX_USD,
  BUSINESS_TYPES,
  CONSENT_VERSION,
  FEATURES,
  LIMITS,
  SECTIONS,
  SERVICES,
  values,
  type AssetStatus,
  type BusinessType,
  type Feature,
  type Section,
  type Service,
} from "./options";

/** Raw form values exactly as the client form holds and sends them. */
export type QuoteFormValues = {
  contactName: string;
  businessName: string;
  email: string;
  whatsapp: string;
  businessType: BusinessType | "";
  businessTypeOther: string;
  service: Service | "";
  goal: string;
  currentUrl: string;
  redesignImprovements: string;
  sections: Section[];
  sectionsOther: string;
  features: Feature[];
  featuresOther: string;
  logoStatus: AssetStatus | "";
  copyStatus: AssetStatus | "";
  photosStatus: AssetStatus | "";
  budgetUsd: string;
  budgetUndefined: boolean;
  desiredDate: string;
  dateUndefined: boolean;
  comments: string;
  consent: boolean;
  consentVersion: string;
};

export const EMPTY_FORM: QuoteFormValues = {
  contactName: "",
  businessName: "",
  email: "",
  whatsapp: "",
  businessType: "",
  businessTypeOther: "",
  service: "",
  goal: "",
  currentUrl: "",
  redesignImprovements: "",
  sections: [],
  sectionsOther: "",
  features: [],
  featuresOther: "",
  logoStatus: "",
  copyStatus: "",
  photosStatus: "",
  budgetUsd: "",
  budgetUndefined: false,
  desiredDate: "",
  dateUndefined: false,
  comments: "",
  consent: false,
  consentVersion: CONSENT_VERSION,
};

/** Normalized request data, ready to store. */
export type QuoteRequestData = {
  contactName: string;
  businessName: string;
  email: string;
  whatsapp: string | null;
  businessType: BusinessType;
  businessTypeOther: string | null;
  service: Service;
  goal: string;
  currentUrl: string | null;
  redesignImprovements: string | null;
  sections: Section[];
  sectionsOther: string | null;
  features: Feature[];
  featuresOther: string | null;
  logoStatus: AssetStatus;
  copyStatus: AssetStatus;
  photosStatus: AssetStatus;
  budgetUsd: number | null;
  budgetUndefined: boolean;
  desiredDate: string | null;
  dateUndefined: boolean;
  comments: string | null;
  consentVersion: string;
};

export type FieldErrors = Partial<Record<keyof QuoteFormValues, string>>;

/** Which step each field belongs to (steps are 1-based). */
export const STEP_FIELDS: Record<1 | 2 | 3 | 4, (keyof QuoteFormValues)[]> = {
  1: ["contactName", "businessName", "email", "whatsapp", "businessType", "businessTypeOther"],
  2: ["service", "goal", "currentUrl", "redesignImprovements"],
  3: [
    "sections",
    "sectionsOther",
    "features",
    "featuresOther",
    "logoStatus",
    "copyStatus",
    "photosStatus",
    "budgetUsd",
    "budgetUndefined",
    "desiredDate",
    "dateUndefined",
    "comments",
  ],
  4: ["consent", "consentVersion"],
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const WHATSAPP_RE = /^\+[1-9]\d{7,14}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const text = (max: number, tooLong: string) => z.string().max(max * 2, tooLong);

const rawSchema = z.object({
  contactName: text(LIMITS.contactName, "El nombre es demasiado largo."),
  businessName: text(LIMITS.businessName, "El nombre es demasiado largo."),
  email: text(LIMITS.email, "El email es demasiado largo."),
  whatsapp: text(LIMITS.whatsapp, "El número es demasiado largo."),
  businessType: z.union([z.enum(values(BUSINESS_TYPES)), z.literal("")]),
  businessTypeOther: text(LIMITS.businessTypeOther, "El texto es demasiado largo."),
  service: z.union([z.enum(values(SERVICES)), z.literal("")]),
  goal: text(LIMITS.goal, "El texto es demasiado largo."),
  currentUrl: text(LIMITS.currentUrl, "La dirección es demasiado larga."),
  redesignImprovements: text(LIMITS.redesignImprovements, "El texto es demasiado largo."),
  sections: z.array(z.enum(values(SECTIONS))).max(SECTIONS.length),
  sectionsOther: text(LIMITS.sectionsOther, "El texto es demasiado largo."),
  features: z.array(z.enum(values(FEATURES))).max(FEATURES.length),
  featuresOther: text(LIMITS.featuresOther, "El texto es demasiado largo."),
  logoStatus: z.union([z.enum(values(ASSET_STATUSES)), z.literal("")]),
  copyStatus: z.union([z.enum(values(ASSET_STATUSES)), z.literal("")]),
  photosStatus: z.union([z.enum(values(ASSET_STATUSES)), z.literal("")]),
  budgetUsd: z.string().max(20),
  budgetUndefined: z.boolean(),
  desiredDate: z.string().max(10),
  dateUndefined: z.boolean(),
  comments: text(LIMITS.comments, "El texto es demasiado largo."),
  consent: z.boolean(),
  consentVersion: z.string().max(40),
});

/** Today's date (YYYY-MM-DD) in Puerto Rico, used for date limits. */
export function todayInPuertoRico(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Puerto_Rico",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function addYears(isoDate: string, years: number) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${String(y + years).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function isRealDate(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Strips spaces, dashes, dots and parentheses. Returns null when empty. */
export function normalizeWhatsapp(input: string) {
  const compact = input.trim().replace(/[\s().-]/g, "");
  return compact === "" ? null : compact;
}

/** Adds https:// when missing and checks it is a public-looking http(s) URL. */
export function normalizeUrl(input: string) {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    if (!url.hostname.includes(".") || url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

const len = (s: string) => s.trim().length;

export type ParseResult =
  | { success: true; data: QuoteRequestData }
  | { success: false; fieldErrors: FieldErrors };

/**
 * Validates raw form values and returns normalized data. Used on the client
 * for per-step feedback and on the server as the source of truth.
 */
export function parseQuoteRequest(input: unknown, now: Date = new Date()): ParseResult {
  const parsed = rawSchema.safeParse(input);
  const errors: FieldErrors = {};

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof QuoteFormValues | undefined;
      if (key && !errors[key]) {
        errors[key] = issue.code === "too_big" ? issue.message : "Selecciona una opción válida.";
      }
    }
    // Missing/garbled payloads (e.g. not an object) still need a visible error.
    if (Object.keys(errors).length === 0) errors.contactName = "No pudimos leer el formulario.";
    return { success: false, fieldErrors: errors };
  }

  const v = parsed.data;
  const set = (key: keyof QuoteFormValues, message: string) => {
    if (!errors[key]) errors[key] = message;
  };
  const checkLength = (key: keyof typeof LIMITS, value: string) => {
    if (len(value) > LIMITS[key]) set(key, `Máximo ${LIMITS[key]} caracteres.`);
  };

  // Step 1
  if (len(v.contactName) === 0) set("contactName", "Escribe el nombre de la persona de contacto.");
  checkLength("contactName", v.contactName);
  if (len(v.businessName) === 0) set("businessName", "Escribe el nombre del negocio u organización.");
  checkLength("businessName", v.businessName);
  if (len(v.email) === 0) set("email", "Escribe tu email.");
  else if (!EMAIL_RE.test(v.email.trim())) set("email", "Escribe un email válido, por ejemplo nombre@correo.com.");
  checkLength("email", v.email);
  const whatsapp = normalizeWhatsapp(v.whatsapp);
  if (whatsapp && !WHATSAPP_RE.test(whatsapp)) {
    set("whatsapp", "Incluye el código de país, por ejemplo +1 787 555 0123.");
  }
  if (v.businessType === "") set("businessType", "Selecciona el tipo de negocio.");
  if (v.businessType === "otro" && len(v.businessTypeOther) === 0) {
    set("businessTypeOther", "Cuéntanos qué tipo de negocio u organización es.");
  }
  checkLength("businessTypeOther", v.businessTypeOther);

  // Step 2
  if (v.service === "") set("service", "Selecciona el servicio que te interesa.");
  if (len(v.goal) === 0) set("goal", "Describe el objetivo principal de tu página.");
  checkLength("goal", v.goal);
  const currentUrl = normalizeUrl(v.currentUrl);
  if (currentUrl === undefined) set("currentUrl", "Escribe una dirección válida, por ejemplo minegocio.com.");
  else if (v.service === "rediseno" && currentUrl === null) {
    set("currentUrl", "Escribe la dirección de la página que quieres rediseñar.");
  }
  checkLength("currentUrl", v.currentUrl);
  if (v.service === "rediseno" && len(v.redesignImprovements) === 0) {
    set("redesignImprovements", "Cuéntanos qué quieres mejorar de tu página actual.");
  }
  checkLength("redesignImprovements", v.redesignImprovements);

  // Step 3
  if (v.sections.includes("otra") && len(v.sectionsOther) === 0) {
    set("sectionsOther", "Describe qué otra sección necesitas.");
  }
  checkLength("sectionsOther", v.sectionsOther);
  if (v.features.includes("otra") && len(v.featuresOther) === 0) {
    set("featuresOther", "Describe qué otra función necesitas.");
  }
  checkLength("featuresOther", v.featuresOther);
  if (v.logoStatus === "") set("logoStatus", "Selecciona una opción.");
  if (v.copyStatus === "") set("copyStatus", "Selecciona una opción.");
  if (v.photosStatus === "") set("photosStatus", "Selecciona una opción.");

  let budgetUsd: number | null = null;
  const budgetRaw = v.budgetUsd.trim().replace(/[,$\s]/g, "");
  if (!v.budgetUndefined && budgetRaw !== "") {
    const n = /^\d+$/.test(budgetRaw) ? Number(budgetRaw) : NaN;
    if (!Number.isSafeInteger(n) || n < 1 || n > BUDGET_MAX_USD) {
      set("budgetUsd", `Escribe una cantidad en dólares entre 1 y ${BUDGET_MAX_USD.toLocaleString("en-US")}, sin decimales.`);
    } else {
      budgetUsd = n;
    }
  }

  let desiredDate: string | null = null;
  const dateRaw = v.desiredDate.trim();
  if (!v.dateUndefined && dateRaw !== "") {
    const today = todayInPuertoRico(now);
    if (!DATE_RE.test(dateRaw) || !isRealDate(dateRaw)) set("desiredDate", "Escribe una fecha válida.");
    else if (dateRaw < today) set("desiredDate", "La fecha no puede estar en el pasado.");
    else if (dateRaw > addYears(today, 3)) set("desiredDate", "Elige una fecha dentro de los próximos 3 años.");
    else desiredDate = dateRaw;
  }

  checkLength("comments", v.comments);

  // Step 4
  if (!v.consent) set("consent", "Necesitamos tu autorización para responder a la solicitud.");
  if (v.consentVersion !== CONSENT_VERSION) {
    set("consent", "El texto de autorización cambió. Recarga la página e inténtalo de nuevo.");
  }

  if (Object.keys(errors).length > 0) return { success: false, fieldErrors: errors };

  const opt = (s: string) => (len(s) === 0 ? null : s.trim());
  return {
    success: true,
    data: {
      contactName: v.contactName.trim(),
      businessName: v.businessName.trim(),
      email: v.email.trim().toLowerCase(),
      whatsapp,
      businessType: v.businessType as BusinessType,
      businessTypeOther: v.businessType === "otro" ? opt(v.businessTypeOther) : null,
      service: v.service as Service,
      goal: v.goal.trim(),
      currentUrl: currentUrl ?? null,
      redesignImprovements: v.service === "rediseno" ? opt(v.redesignImprovements) : null,
      sections: [...new Set(v.sections)],
      sectionsOther: v.sections.includes("otra") ? opt(v.sectionsOther) : null,
      features: [...new Set(v.features)],
      featuresOther: v.features.includes("otra") ? opt(v.featuresOther) : null,
      logoStatus: v.logoStatus as AssetStatus,
      copyStatus: v.copyStatus as AssetStatus,
      photosStatus: v.photosStatus as AssetStatus,
      budgetUsd,
      budgetUndefined: v.budgetUndefined,
      desiredDate,
      dateUndefined: v.dateUndefined,
      comments: opt(v.comments),
      consentVersion: v.consentVersion,
    },
  };
}

/** Errors that belong to the given step only. */
export function errorsForStep(errors: FieldErrors, step: 1 | 2 | 3 | 4): FieldErrors {
  const out: FieldErrors = {};
  for (const key of STEP_FIELDS[step]) if (errors[key]) out[key] = errors[key];
  return out;
}

/** First step that has an error, or null. */
export function firstStepWithError(errors: FieldErrors): 1 | 2 | 3 | 4 | null {
  for (const step of [1, 2, 3, 4] as const) {
    if (Object.keys(errorsForStep(errors, step)).length > 0) return step;
  }
  return null;
}
