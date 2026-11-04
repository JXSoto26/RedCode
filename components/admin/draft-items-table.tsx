import type { StoredDraft } from "@/lib/admin/draft";
import { formatCents, hundredthsToDecimal, type DraftTotals } from "@/lib/admin/money";

/**
 * Items table of the printable draft. The header repeats on every printed
 * page; the total appears once, after the last item, and stays with it.
 */

export function Missing({ label }: { label: string }) {
  return (
    <span className="rounded border border-dashed border-amber-500 bg-amber-50 px-1.5 py-0.5 text-sm text-amber-800">
      Pendiente: {label}
    </span>
  );
}

/** One item row; a row is never split across printed pages. */
function ItemRow({ item, line }: { item: StoredDraft["items"][number]; line: number | null }) {
  return (
    <tr className="break-inside-avoid border-b border-zinc-200 align-top">
      <td className="py-2.5 pr-3">{item.description ?? <Missing label="descripción" />}</td>
      <td className="py-2.5 pr-3 text-right tabular-nums">
        {item.quantityHundredths === null ? (
          <Missing label="cantidad" />
        ) : (
          hundredthsToDecimal(item.quantityHundredths).replace(/\.00$/, "")
        )}
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums">
        {item.unitPriceCents === null ? <Missing label="precio" /> : formatCents(item.unitPriceCents)}
      </td>
      <td className="py-2.5 text-right tabular-nums">{line === null ? "—" : formatCents(line)}</td>
    </tr>
  );
}

export function DraftItemsTable({ items, totals }: { items: StoredDraft["items"]; totals: DraftTotals | null }) {
  return (
    <div className="mt-3 overflow-x-auto print:overflow-visible">
      <table className="w-full min-w-[32rem] border-collapse text-[15px] print:min-w-0">
        <thead>
          <tr className="border-b-2 border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-500">
            <th scope="col" className="py-2 pr-3 font-semibold">Descripción</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Cant.</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Precio unitario</th>
            <th scope="col" className="py-2 text-right font-semibold">Importe</th>
          </tr>
        </thead>
        {/* The header repeats on every printed page. The total is not a
            <tfoot> (browsers repeat those too): it is the last row, kept
            together with the last item when the page allows it. */}
        <tbody>
          {items.slice(0, -1).map((item, i) => (
            <ItemRow key={item.id} item={item} line={totals?.lines[i] ?? null} />
          ))}
        </tbody>
        <tbody className="break-inside-avoid">
          {items.slice(-1).map((item) => (
            <ItemRow key={item.id} item={item} line={totals?.lines[items.length - 1] ?? null} />
          ))}
          <tr className="break-inside-avoid">
            <th scope="row" colSpan={3} className="pt-4 pr-3 text-right text-sm font-semibold">
              Total (USD)
            </th>
            <td className="pt-4 text-right text-lg font-bold tabular-nums">
              {totals ? formatCents(totals.totalCents) : "—"}
            </td>
          </tr>
        </tbody>
      </table>
      {totals?.incomplete && (
        <p className="mt-2 text-right text-xs text-amber-700">
          Total parcial: hay partidas sin cantidad o precio.
        </p>
      )}
    </div>
  );
}
