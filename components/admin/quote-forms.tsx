"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, FileCheck2, Loader2, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/quote/fields";
import {
  confirmSend,
  finalizeQuote,
  generateQuotePdf,
  reconcileSend,
  resolveSend,
  type QuoteActionState,
} from "@/lib/admin/quote-actions";
import { BODY_MAX, SUBJECT_MAX } from "@/lib/admin/quote-send";
import { cn } from "@/lib/utils";

const idle: QuoteActionState = { ok: false, message: null };

function Feedback({ state }: { state: QuoteActionState }) {
  if (!state.message) return null;
  return (
    <div
      role={state.ok ? "status" : "alert"}
      className={cn(
        "rounded-xl border p-3 text-sm",
        state.ok
          ? "border-emerald-400/30 bg-emerald-400/[0.06] text-emerald-100"
          : "border-brand-600/40 bg-brand-600/10 text-brand-200"
      )}
    >
      <p>{state.message}</p>
      {state.problems && state.problems.length > 0 && (
        <ul className="mt-2 list-inside list-disc space-y-0.5">
          {state.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Finalizing freezes the saved draft. It sends nothing and does not change the status. */
export function FinalizeForm({ requestId, draftVersion, nextRevision }: { requestId: string; draftVersion: number; nextRevision: number }) {
  const [state, action, pending] = useActionState(finalizeQuote, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="expectedVersion" value={draftVersion} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <FileCheck2 aria-hidden />}
          Finalizar cotización (revisión {nextRevision})
        </Button>
      </div>
      <p className="text-xs text-muted-2">
        Congela la versión {draftVersion} del borrador y genera su PDF. No envía nada ni cambia el estado de la
        solicitud. Los cambios posteriores del borrador no la modifican.
      </p>
      <Feedback state={state} />
    </form>
  );
}

export function GeneratePdfForm({ quoteId }: { quoteId: string }) {
  const [state, action, pending] = useActionState(generateQuotePdf, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="quoteId" value={quoteId} />
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Generar PDF
        </Button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

type SendFormProps = {
  quoteId: string;
  requestKey: string;
  kind: "envio" | "reenvio";
  defaultSubject: string;
  defaultBody: string;
  blocked: boolean;
};

/** The only control that sends a quote. Requires an explicit checkbox and button press. */
export function SendForm({ quoteId, requestKey, kind, defaultSubject, defaultBody, blocked }: SendFormProps) {
  const [state, action, pending] = useActionState(confirmSend, idle);
  const [confirmed, setConfirmed] = useState(false);
  const done = state.ok;

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="quoteId" value={quoteId} />
      <input type="hidden" name="requestKey" value={requestKey} />
      <input type="hidden" name="kind" value={kind} />

      <div className="flex flex-col gap-2">
        <label htmlFor="subject" className="text-sm font-medium text-foreground/90">
          Asunto
        </label>
        <input
          id="subject"
          name="subject"
          defaultValue={defaultSubject}
          maxLength={SUBJECT_MAX}
          required
          disabled={done}
          className={fieldClass}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="body" className="text-sm font-medium text-foreground/90">
          Mensaje
        </label>
        <textarea
          id="body"
          name="body"
          defaultValue={defaultBody}
          maxLength={BODY_MAX}
          rows={10}
          required
          disabled={done}
          className={cn(fieldClass, "resize-y")}
        />
      </div>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="confirm"
          value="si"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          disabled={blocked || done}
          className="mt-0.5 size-4 accent-brand-600"
        />
        <span>
          {kind === "reenvio"
            ? "Confirmo que quiero reenviar esta cotización. Se enviará otro email con el mismo PDF."
            : "Confirmo que quiero enviar esta cotización al destinatario indicado, con el PDF adjunto."}
        </span>
      </label>

      <div>
        <Button type="submit" disabled={blocked || !confirmed || pending || done}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : done ? <CheckCircle2 aria-hidden /> : <Send aria-hidden />}
          {pending ? "Enviando…" : kind === "reenvio" ? "Confirmar reenvío" : "Confirmar envío"}
        </Button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function ReconcileForm({ quoteId, sendId }: { quoteId: string; sendId: string }) {
  const [state, action, pending] = useActionState(reconcileSend, idle);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="quoteId" value={quoteId} />
      <input type="hidden" name="sendId" value={sendId} />
      <div>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
          Comprobar con Resend
        </Button>
      </div>
      <p className="text-xs text-muted-2">
        Repite la misma petición con la misma clave de idempotencia: si Resend ya la había aceptado, devuelve el
        mismo resultado y no envía otro email.
      </p>
      <Feedback state={state} />
    </form>
  );
}

export function ResolveForm({ quoteId, sendId }: { quoteId: string; sendId: string }) {
  const [state, action, pending] = useActionState(resolveSend, idle);
  const [resolution, setResolution] = useState<"aceptado" | "no_enviado">("aceptado");
  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border border-border bg-background/40 p-3">
      <input type="hidden" name="quoteId" value={quoteId} />
      <input type="hidden" name="sendId" value={sendId} />
      <p className="text-xs text-muted-2">
        Resolución manual, después de buscar el email en el panel de Resend (Emails). No llama a Resend.
      </p>
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="sr-only">Resultado comprobado</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="resolution"
            value="aceptado"
            checked={resolution === "aceptado"}
            onChange={() => setResolution("aceptado")}
            className="accent-brand-600"
          />
          Aparece en Resend
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="resolution"
            value="no_enviado"
            checked={resolution === "no_enviado"}
            onChange={() => setResolution("no_enviado")}
            className="accent-brand-600"
          />
          No aparece: no se envió
        </label>
      </fieldset>
      {resolution === "aceptado" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`provider-${sendId}`} className="text-xs font-medium text-muted">
            ID del email en Resend
          </label>
          <input id={`provider-${sendId}`} name="providerId" maxLength={100} className={fieldClass} />
        </div>
      )}
      <label className="flex items-start gap-2 text-xs">
        <input type="checkbox" name="confirm" value="si" className="mt-0.5 accent-brand-600" />
        Lo he comprobado en el panel de Resend.
      </label>
      <div>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Guardar resolución
        </Button>
      </div>
      <Feedback state={state} />
    </form>
  );
}
