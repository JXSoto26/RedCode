"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Eye, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/quote/fields";
import { saveDraft, type DraftState } from "@/lib/admin/actions";
import { DRAFT_LIMITS, type DraftItemInput, type DraftText } from "@/lib/admin/draft";
import { formatCents } from "@/lib/admin/money";
import { cn } from "@/lib/utils";

type Props = {
  requestId: string;
  version: number | null;
  text: DraftText;
  items: DraftItemInput[];
  savedTotal: { totalCents: number; incomplete: boolean } | null;
};

type Row = DraftItemInput & { key: number };

const PENDING_FIELDS: (keyof DraftText)[] = ["title", "summary", "deliverables", "exclusions"];

function Pending() {
  return (
    <span className="ml-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-200">
      Pendiente
    </span>
  );
}

function Optional() {
  return <span className="font-normal text-muted-2"> (opcional)</span>;
}

export function DraftEditor({ requestId, version, text, items, savedTotal }: Props) {
  const initialState: DraftState = {
    ok: false,
    errors: [],
    conflict: false,
    version,
    savedAt: null,
    totalCents: savedTotal?.totalCents ?? null,
    incomplete: savedTotal?.incomplete ?? false,
  };
  const [state, action, pending] = useActionState(saveDraft, initialState);
  const [fields, setFields] = React.useState<DraftText>(text);
  const nextKey = React.useRef(items.length);
  const [rows, setRows] = React.useState<Row[]>(() => items.map((item, i) => ({ ...item, key: i })));
  const [dirty, setDirty] = React.useState(false);

  // A successful save clears the "unsaved changes" flag.
  const [lastSavedAt, setLastSavedAt] = React.useState(state.savedAt);
  if (state.ok && state.savedAt !== lastSavedAt) {
    setLastSavedAt(state.savedAt);
    setDirty(false);
  }

  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const setField = (name: keyof DraftText) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFields((f) => ({ ...f, [name]: e.target.value }));
    setDirty(true);
  };
  const setRow = (key: number, name: keyof DraftItemInput, value: string) => {
    setRows((r) => r.map((row) => (row.key === key ? { ...row, [name]: value } : row)));
    setDirty(true);
  };
  const addRow = () => {
    setRows((r) => [...r, { key: nextKey.current++, description: "", quantity: "", unitPrice: "" }]);
    setDirty(true);
  };
  const removeRow = (key: number) => {
    setRows((r) => r.filter((row) => row.key !== key));
    setDirty(true);
  };

  const payload = JSON.stringify({
    requestId,
    expectedVersion: state.version,
    draft: fields,
    items: rows.map(({ description, quantity, unitPrice }) => ({ description, quantity, unitPrice })),
  });

  const textField = (name: keyof DraftText, label: string, opts: { multiline?: boolean; optional?: boolean; hint?: string }) => {
    const id = `draft-${name}`;
    const common = {
      id,
      value: fields[name],
      onChange: setField(name),
      maxLength: DRAFT_LIMITS[name],
      "aria-describedby": opts.hint ? `${id}-hint` : undefined,
    };
    return (
      <div className="flex flex-col gap-2">
        <label htmlFor={id} className="text-sm font-medium text-foreground/90">
          {label}
          {opts.optional ? <Optional /> : PENDING_FIELDS.includes(name) && !fields[name].trim() && <Pending />}
        </label>
        {opts.hint && (
          <p id={`${id}-hint`} className="text-sm text-muted-2">
            {opts.hint}
          </p>
        )}
        {opts.multiline ? (
          <textarea {...common} rows={5} className={cn(fieldClass, "resize-y")} />
        ) : (
          <input {...common} type="text" className={fieldClass} />
        )}
      </div>
    );
  };

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="payload" value={payload} />

      {textField("title", "Título", {})}
      {textField("summary", "Resumen y alcance", { multiline: true })}
      {textField("deliverables", "Entregables", { multiline: true, hint: "Uno por línea." })}
      {textField("exclusions", "Exclusiones", { multiline: true, hint: "Lo que no incluye la propuesta. Uno por línea." })}

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-foreground/90">
          Partidas
          {rows.length === 0 && <Pending />}
        </legend>
        <p className="text-sm text-muted-2">
          Precios en USD. Puedes dejar campos vacíos y completarlos después.
        </p>

        {rows.length > 0 && (
          <ol className="flex flex-col gap-3">
            {rows.map((row, index) => {
              const n = index + 1;
              return (
                <li key={row.key} className="rounded-xl border border-border bg-background/40 p-3 sm:p-4">
                  <div className="grid gap-3 sm:grid-cols-[1fr_7rem_9rem_auto] sm:items-end">
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor={`item-${row.key}-description`} className="text-xs font-medium text-muted">
                        Partida {n}: descripción
                        {!row.description.trim() && <Pending />}
                      </label>
                      <input
                        id={`item-${row.key}-description`}
                        value={row.description}
                        onChange={(e) => setRow(row.key, "description", e.target.value)}
                        maxLength={DRAFT_LIMITS.itemDescription}
                        className={fieldClass}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor={`item-${row.key}-quantity`} className="text-xs font-medium text-muted">
                        Cantidad
                      </label>
                      <input
                        id={`item-${row.key}-quantity`}
                        value={row.quantity}
                        onChange={(e) => setRow(row.key, "quantity", e.target.value)}
                        inputMode="decimal"
                        maxLength={12}
                        placeholder="—"
                        className={fieldClass}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor={`item-${row.key}-price`} className="text-xs font-medium text-muted">
                        Precio unitario (USD)
                      </label>
                      <input
                        id={`item-${row.key}-price`}
                        value={row.unitPrice}
                        onChange={(e) => setRow(row.key, "unitPrice", e.target.value)}
                        inputMode="decimal"
                        maxLength={14}
                        placeholder="—"
                        className={fieldClass}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRow(row.key)}
                      aria-label={`Quitar partida ${n}`}
                      className="justify-self-start sm:justify-self-auto"
                    >
                      <Trash2 aria-hidden />
                      <span className="sm:sr-only">Quitar</span>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={addRow}
            disabled={rows.length >= DRAFT_LIMITS.items}
          >
            <Plus aria-hidden />
            Añadir partida
          </Button>
        </div>
      </fieldset>

      {textField("estimatedTime", "Tiempo estimado", { optional: true })}
      {textField("terms", "Condiciones", { multiline: true, optional: true })}
      {textField("validity", "Vigencia", { optional: true })}

      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <p className="text-sm text-muted">Total del borrador guardado</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {state.totalCents === null ? "—" : formatCents(state.totalCents)}
        </p>
        <p className="mt-1 text-xs text-muted-2">
          Lo calcula el servidor al guardar.
          {state.incomplete && " Hay partidas sin cantidad o precio: el total es parcial."}
          {dirty && " Tienes cambios sin guardar."}
        </p>
      </div>

      {state.errors.length > 0 && (
        <div role="alert" className="rounded-xl border border-brand-600/40 bg-brand-600/10 p-4 text-sm text-brand-200">
          <ul className="list-inside list-disc space-y-1">
            {state.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          {state.conflict && (
            <p className="mt-3">
              <a href={`/admin/solicitudes/${requestId}`} className="font-semibold underline underline-offset-4">
                Recargar la versión guardada
              </a>
            </p>
          )}
        </div>
      )}
      {state.ok && (
        <p role="status" className="text-sm text-emerald-300">
          Borrador guardado (versión {state.version}).
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Guardar borrador
        </Button>
        {(state.version ?? 0) > 0 && (
          <Button asChild variant="secondary">
            <Link href={`/admin/solicitudes/${requestId}/cotizacion`}>
              <Eye aria-hidden />
              Vista previa
            </Link>
          </Button>
        )}
        <p className="text-xs text-muted-2">
          Guardar un borrador no envía nada al cliente ni cambia el estado de la solicitud.
        </p>
      </div>
    </form>
  );
}
