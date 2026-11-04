import Link from "next/link";

export default function RequestNotFound() {
  return (
    <div className="container-page grid min-h-[60dvh] place-items-center py-16">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Solicitud no encontrada</h1>
        <p className="mt-3 text-sm text-muted">El enlace no es válido o la solicitud no existe.</p>
        <Link href="/admin/solicitudes" className="mt-6 inline-block text-sm text-brand-300 underline underline-offset-4">
          Volver a solicitudes
        </Link>
      </div>
    </div>
  );
}
