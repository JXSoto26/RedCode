import { STATUS_LABELS, type RequestStatus } from "@/lib/admin/labels";
import { cn } from "@/lib/utils";

const TONES: Record<RequestStatus, string> = {
  nueva: "border-brand-500/40 bg-brand-600/15 text-brand-200",
  por_aclarar: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  propuesta_enviada: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  aceptada: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  cerrada: "border-white/15 bg-white/[0.04] text-muted",
};

export function StatusBadge({ status, className }: { status: RequestStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        TONES[status],
        className
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
