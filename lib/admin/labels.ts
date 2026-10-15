import { REQUEST_STATUSES, type NotificationStatus } from "@/lib/quote/options";

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const STATUS_LABELS: Record<RequestStatus, string> = {
  nueva: "Nueva",
  por_aclarar: "Por aclarar",
  propuesta_enviada: "Propuesta enviada",
  aceptada: "Aceptada",
  cerrada: "Cerrada",
};

export const isRequestStatus = (value: unknown): value is RequestStatus =>
  typeof value === "string" && (REQUEST_STATUSES as readonly string[]).includes(value);

const SKIP_REASONS: Record<string, string> = {
  recipient_not_in_allowlist: "el destinatario no está en la lista autorizada",
  email_not_configured: "el email no estaba configurado",
};

/**
 * Human description of a notification. "enviado" only means the provider
 * accepted the message; delivery is never confirmed by the app.
 */
export function describeEmailStatus(
  status: NotificationStatus,
  lastError: string | null,
  attempts: number
): { label: string; detail: string; tone: "ok" | "warn" | "error" | "muted" } {
  switch (status) {
    case "enviado":
      return {
        label: "Aceptado por Resend",
        detail: "Resend lo aceptó para envío. La entrega al buzón no está confirmada.",
        tone: "ok",
      };
    case "pendiente":
      return { label: "Pendiente", detail: "Todavía no se ha intentado enviar.", tone: "muted" };
    case "fallido":
      return {
        label: "Falló",
        detail: `No se pudo enviar (${lastError ?? "error"}) tras ${attempts} ${attempts === 1 ? "intento" : "intentos"}.`,
        tone: "error",
      };
    case "omitido":
      return {
        label: "Omitido",
        detail: `No se envió: ${(lastError && SKIP_REASONS[lastError]) ?? lastError ?? "motivo desconocido"}.`,
        tone: "warn",
      };
  }
}

const dateTime = new Intl.DateTimeFormat("es-PR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Puerto_Rico",
});
const dateOnly = new Intl.DateTimeFormat("es-PR", { dateStyle: "medium", timeZone: "America/Puerto_Rico" });

/** Dates are always shown in Puerto Rico time. */
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatDate = (iso: string) => dateOnly.format(new Date(iso));

/** wa.me link for a stored WhatsApp number; 10-digit numbers are assumed NANP (+1). */
export function whatsappLink(raw: string | null): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 10) digits = `1${digits}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return `https://wa.me/${digits}`;
}

/** mailto: link only for something that looks like a single address. */
export function mailtoLink(email: string | null): string | null {
  if (!email || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) return null;
  return `mailto:${email}`;
}
