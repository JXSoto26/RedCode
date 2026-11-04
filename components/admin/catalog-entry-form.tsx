"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/quote/fields";
import { saveCatalogEntry, type ActionState } from "@/lib/admin/actions";
import { CATALOG_KIND_LABELS, CATALOG_LIMITS, type CatalogEntry } from "@/lib/admin/catalog";
import { centsToInput } from "@/lib/admin/money";
import { cn } from "@/lib/utils";

const initial: ActionState = { ok: false, message: null };

/** Edits one entry. Saving creates a new version; existing drafts keep theirs. */
export function CatalogEntryForm({ entry }: { entry: CatalogEntry }) {
  const [state, action, pending] = useActionState(saveCatalogEntry, initial);
  const id = (name: string) => `${entry.code}-${name}`;
  const manual = entry.kind === "manual";

  const area = (name: "scope" | "includes" | "excludes", label: string) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id(name)} className="text-xs font-medium text-muted">
        {label}
      </label>
      <textarea
        id={id(name)}
        name={name}
        defaultValue={entry[name]}
        rows={3}
        maxLength={CATALOG_LIMITS.text}
        className={cn(fieldClass, "resize-y")}
      />
    </div>
  );

  return (
    <form action={action} className="flex flex-col gap-3" key={entry.version}>
      <input type="hidden" name="code" value={entry.code} />
      <input type="hidden" name="expectedVersion" value={entry.version} />
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem_10rem]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id("title")} className="text-xs font-medium text-muted">
            Nombre
          </label>
          <input id={id("title")} name="title" defaultValue={entry.title} maxLength={CATALOG_LIMITS.title} className={fieldClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id("unit")} className="text-xs font-medium text-muted">
            Unidad
          </label>
          <input id={id("unit")} name="unit" defaultValue={entry.unit} maxLength={CATALOG_LIMITS.unit} className={fieldClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id("price")} className="text-xs font-medium text-muted">
            Precio (USD)
          </label>
          <input
            id={id("price")}
            name="price"
            defaultValue={centsToInput(entry.priceCents)}
            inputMode="decimal"
            maxLength={14}
            placeholder={manual ? "Sin precio" : "—"}
            disabled={manual}
            aria-describedby={manual ? id("manual") : undefined}
            className={fieldClass}
          />
          {manual && (
            <p id={id("manual")} className="text-xs text-muted-2">
              {CATALOG_KIND_LABELS.manual}: sin precio precargado.
            </p>
          )}
        </div>
      </div>
      {manual && <input type="hidden" name="price" value="" />}
      {area("scope", "Alcance")}
      {area("includes", "Incluye")}
      {area("excludes", "No incluye")}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" name="active" defaultChecked={entry.active} className="size-4 accent-brand-600" />
          Activo (aparece en el editor)
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" name="requiresReview" defaultChecked={entry.requiresReview} className="size-4 accent-brand-600" />
          Requiere revisión manual
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Guardar versión {entry.version + 1}
        </Button>
        {state.message && (
          <p role="status" className={cn("text-sm", state.ok ? "text-success-300" : "text-brand-300")}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
