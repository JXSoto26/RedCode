"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AdminError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <div className="container-page grid min-h-[60dvh] place-items-center py-16">
      <div role="alert" className="max-w-md text-center">
        <h1 className="text-2xl font-bold tracking-tight">Algo salió mal</h1>
        <p className="mt-3 text-sm text-muted">
          No se pudo cargar esta página del panel. Tus datos no se han modificado.
          {error.digest && <span className="mt-2 block font-mono text-xs text-muted-2">Código: {error.digest}</span>}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={() => unstable_retry()}>Reintentar</Button>
          <Button asChild variant="secondary">
            <Link href="/admin/solicitudes">Ir a solicitudes</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
