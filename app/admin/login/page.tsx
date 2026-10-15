import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { LoginForm } from "@/components/admin/login-form";
import { getAdminSession } from "@/lib/admin/auth";
import { logout } from "@/lib/admin/actions";

export const metadata: Metadata = { title: "Entrar" };

export default async function AdminLoginPage() {
  const session = await getAdminSession();
  if (session.status === "admin") redirect("/admin/solicitudes");

  return (
    <main className="relative grid min-h-dvh place-items-center px-6 py-16">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-radial-brand" />
      <div className="relative w-full max-w-sm">
        <Logo />
        <h1 className="mt-8 text-2xl font-bold tracking-tight">Panel privado</h1>
        <p className="mt-2 text-sm text-muted">Acceso solo para el administrador del estudio.</p>

        <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
          {session.status === "unconfigured" ? (
            <p className="text-sm text-muted">
              El acceso al panel no está configurado en este entorno.
            </p>
          ) : session.status === "forbidden" ? (
            <div className="flex flex-col gap-4">
              <p role="alert" className="text-sm text-brand-200">
                La cuenta {session.email ? <strong>{session.email}</strong> : "actual"} no tiene acceso al panel.
              </p>
              <form action={logout}>
                <button type="submit" className="text-sm font-semibold text-brand-300 underline underline-offset-4">
                  Cerrar sesión y entrar con otra cuenta
                </button>
              </form>
            </div>
          ) : (
            <LoginForm />
          )}
        </div>
      </div>
    </main>
  );
}
