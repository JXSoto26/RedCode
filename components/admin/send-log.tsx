import { ReconcileForm, ResolveForm } from "@/components/admin/quote-forms";
import { formatDateTime } from "@/lib/admin/labels";
import { SEND_STATUS, STATUS_EFFECT_LABEL } from "@/lib/admin/quote-send";
import type { QuoteSend } from "@/lib/admin/quotes";
import { cn } from "@/lib/utils";

const TONE = { ok: "text-emerald-300", warn: "text-amber-200", error: "text-brand-300", muted: "text-muted" };

const STALE_MS = 2 * 60 * 1000;
const WINDOW_MS = 23 * 60 * 60 * 1000;

/** Send history of a quote, with reconciliation for uncertain results. */
export function SendLog({ quoteId, sends, now }: { quoteId: string; sends: QuoteSend[]; now: number }) {
  if (sends.length === 0) return <p className="text-sm text-muted-2">Todavía no se ha enviado.</p>;

  return (
    <ol className="flex flex-col gap-4">
      {sends.map((s) => {
        const meta = SEND_STATUS[s.status];
        const stuck = s.status === "en_proceso" && s.lastAttemptAt && now - Date.parse(s.lastAttemptAt) > STALE_MS;
        const needsReconcile = s.status === "incierto" || stuck;
        const inWindow = now - Date.parse(s.createdAt) < WINDOW_MS;
        return (
          <li key={s.id} className="rounded-xl border border-border bg-background/40 p-4 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">
                {s.kind === "reenvio" ? "Reenvío" : "Envío"} · <span className={cn(TONE[meta.tone])}>{stuck ? "Sin respuesta registrada" : meta.label}</span>
              </p>
              <p className="text-xs text-muted-2">{formatDateTime(s.createdAt)}</p>
            </div>
            <p className="mt-1 text-xs text-muted-2">{meta.detail}</p>
            <dl className="mt-3 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[9rem_1fr]">
              <dt className="text-muted-2">Destinatario</dt>
              <dd className="break-all">{s.recipientEmail}</dd>
              <dt className="text-muted-2">Asunto</dt>
              <dd className="break-words">{s.subject}</dd>
              <dt className="text-muted-2">Confirmado por</dt>
              <dd className="break-all">{s.requestedByEmail}</dd>
              <dt className="text-muted-2">Intentos</dt>
              <dd>{s.attempts}</dd>
              {s.providerId && (
                <>
                  <dt className="text-muted-2">ID de Resend</dt>
                  <dd className="break-all font-mono">{s.providerId}</dd>
                </>
              )}
              {s.acceptedAt && (
                <>
                  <dt className="text-muted-2">Aceptado</dt>
                  <dd>{formatDateTime(s.acceptedAt)}</dd>
                </>
              )}
              {s.lastError && (
                <>
                  <dt className="text-muted-2">Último error</dt>
                  <dd className="font-mono">{s.lastError}</dd>
                </>
              )}
              {s.statusEffect && (
                <>
                  <dt className="text-muted-2">Estado de la solicitud</dt>
                  <dd>{STATUS_EFFECT_LABEL[s.statusEffect] ?? s.statusEffect}</dd>
                </>
              )}
              <dt className="text-muted-2">PDF adjunto</dt>
              <dd className="break-all font-mono">sha256 {s.pdfSha256.slice(0, 16)}…</dd>
              {s.resolvedManually && (
                <>
                  <dt className="text-muted-2">Resolución</dt>
                  <dd>Manual</dd>
                </>
              )}
            </dl>
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-muted">Ver mensaje enviado</summary>
              <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-surface-2 p-3 text-xs">{s.body}</p>
            </details>

            {needsReconcile && (
              <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
                <p className="text-xs text-amber-100">
                  No reenvíes por tu cuenta: podría llegar dos veces.{" "}
                  {inWindow
                    ? "Primero usa “Comprobar con Resend”. Si no se resuelve, búscalo en el panel de Resend y regístralo a mano."
                    : "Pasaron más de 23 horas: búscalo en el panel de Resend (Emails) y regístralo a mano."}
                </p>
                {inWindow && <ReconcileForm quoteId={quoteId} sendId={s.id} />}
                <ResolveForm quoteId={quoteId} sendId={s.id} />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
