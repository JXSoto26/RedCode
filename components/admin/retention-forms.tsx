"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/quote/fields";
import { changeRelationship, setRetentionHold, type ActionState } from "@/lib/admin/actions";
import { RELATIONSHIPS, RELATIONSHIP_HELP, RELATIONSHIP_LABELS, type Relationship } from "@/lib/admin/labels";
import { cn } from "@/lib/utils";

const initial: ActionState = { ok: false, message: null };

function Message({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <p role="status" className={cn("text-sm", state.ok ? "text-emerald-300" : "text-brand-300")}>
      {state.message}
    </p>
  );
}

/** Records the commercial relationship. Changing it never deletes anything. */
export function RelationshipForm({ requestId, current }: { requestId: string; current: Relationship }) {
  const [state, action, pending] = useActionState(changeRelationship, initial);
  const [selected, setSelected] = useState<Relationship>(current);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="expected" value={current} />
      <label htmlFor="relationship" className="text-sm font-medium text-foreground/90">
        Relación comercial
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          id="relationship"
          name="relationship"
          key={current}
          defaultValue={current}
          onChange={(e) => setSelected(e.target.value as Relationship)}
          className={cn(fieldClass, "sm:flex-1")}
        >
          {RELATIONSHIPS.map((r) => (
            <option key={r} value={r}>
              {RELATIONSHIP_LABELS[r]}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Guardar relación
        </Button>
      </div>
      <p className="text-xs text-muted-2">{RELATIONSHIP_HELP[selected]}</p>
      <Message state={state} />
    </form>
  );
}

/** A documented reason (dispute, legal obligation) that keeps the file out of the cleanup. */
export function RetentionHoldForm({ requestId, hold }: { requestId: string; hold: boolean }) {
  const [state, action, pending] = useActionState(setRetentionHold, initial);

  if (hold) {
    return (
      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="hold" value="off" />
        <Button type="submit" variant="secondary" size="sm" disabled={pending} className="self-start">
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Retirar conservación
        </Button>
        <Message state={state} />
      </form>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="hold" value="on" />
      <label htmlFor="holdReason" className="text-sm font-medium text-foreground/90">
        Conservar por un motivo documentado
      </label>
      <textarea
        id="holdReason"
        name="reason"
        rows={2}
        maxLength={300}
        placeholder="Ej.: reclamación abierta, requerimiento del contador…"
        className={fieldClass}
      />
      <Button type="submit" variant="secondary" size="sm" disabled={pending} className="self-start">
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        Marcar conservación
      </Button>
      <p className="text-xs text-muted-2">
        Úsalo solo con un motivo real y documentado. No cuenta como actividad comercial ni sustituye el criterio de
        tu contador.
      </p>
      <Message state={state} />
    </form>
  );
}
