"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/quote/fields";
import { addNote, type ActionState } from "@/lib/admin/actions";
import { cn } from "@/lib/utils";

const initial: ActionState = { ok: false, message: null };

export function NoteForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(addNote, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="requestId" value={requestId} />
      <label htmlFor="note-body" className="sr-only">
        Nueva nota interna
      </label>
      <textarea
        id="note-body"
        name="body"
        rows={3}
        maxLength={5000}
        required
        placeholder="Escribe una nota interna…"
        className={cn(fieldClass, "resize-y")}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-2">Solo visible en este panel. Nunca se envía al cliente.</p>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Añadir nota
        </Button>
      </div>
      {state.message && (
        <p role="status" className={cn("text-sm", state.ok ? "text-emerald-300" : "text-brand-300")}>
          {state.message}
        </p>
      )}
    </form>
  );
}
