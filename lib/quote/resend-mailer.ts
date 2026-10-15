import "server-only";
import type { Mailer } from "./types";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * Minimal Resend client over its REST API. Uses Resend's Idempotency-Key header
 * so a retried notification is never delivered twice.
 */
export function createResendMailer(
  apiKey: string,
  from: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Mailer {
  return {
    async send(message) {
      let response: Response;
      try {
        response = await fetchImpl(RESEND_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": message.idempotencyKey,
          },
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            html: message.html,
            ...(message.replyTo && { reply_to: message.replyTo }),
            ...(message.attachments?.length && { attachments: message.attachments }),
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const name = error instanceof Error ? error.name : "";
        return { ok: false, error: name === "TimeoutError" ? "timeout" : "network_error" };
      }

      if (!response.ok) {
        // Only keep status + error name: Resend messages can include addresses.
        const body = (await response.json().catch(() => null)) as { name?: unknown } | null;
        const name = typeof body?.name === "string" && /^[\w-]{1,40}$/.test(body.name) ? body.name : "error";
        return { ok: false, error: `http_${response.status}_${name}` };
      }

      const body = (await response.json().catch(() => null)) as { id?: unknown } | null;
      return { ok: true, id: typeof body?.id === "string" ? body.id : null };
    },
  };
}
