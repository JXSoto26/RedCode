"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/quote/fields";
import { changeStatus, type ActionState } from "@/lib/admin/actions";
import { STATUS_LABELS, type RequestStatus } from "@/lib/admin/labels";
import { REQUEST_STATUSES } from "@/lib/quote/options";
import { cn } from "@/lib/utils";

const initial: ActionState = { ok: false, message: null };

/** Changing the status never sends email; it only records the change. */
export function StatusForm({ requestId, current }: { requestId: string; current: RequestStatus }) {
  const [state, action, pending] = useActionState(changeStatus, initial);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="expectedStatus" value={current} />
      <label htmlFor="newStatus" className="text-sm font-medium text-foreground/90">
        Cambiar estado
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          id="newStatus"
          name="newStatus"
          // Re-mount when the saved status changes so the select shows it.
          key={current}
          defaultValue={current}
          className={cn(fieldClass, "sm:flex-1")}
        >
          {REQUEST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Guardar estado
        </Button>
      </div>
      <p className="text-xs text-muted-2">Cambiar el estado no envía ningún email.</p>
      {state.message && (
        <p role="status" className={cn("text-sm", state.ok ? "text-emerald-300" : "text-brand-300")}>
          {state.message}
        </p>
      )}
    </form>
  );
}
