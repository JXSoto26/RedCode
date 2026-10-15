export default function Loading() {
  return (
    <div className="container-page py-10" role="status" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="h-8 w-48 animate-pulse rounded-lg bg-white/[0.06]" />
      <div className="mt-6 h-12 animate-pulse rounded-xl bg-white/[0.04]" />
      <div className="mt-6 flex flex-col gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-white/[0.04]" />
        ))}
      </div>
    </div>
  );
}
