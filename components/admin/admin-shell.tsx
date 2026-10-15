import Link from "next/link";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/logo";
import { logout } from "@/lib/admin/actions";

/** Header and page frame for every signed-in admin page. */
export function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur print:hidden">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4 sm:gap-6">
            <Link href="/admin/solicitudes" aria-label="Panel de RedCode" className="shrink-0">
              <Logo />
            </Link>
            <nav aria-label="Panel">
              <Link
                href="/admin/solicitudes"
                className="rounded-full px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-white/[0.05] hover:text-foreground"
              >
                Solicitudes
              </Link>
            </nav>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden truncate text-sm text-muted-2 md:inline" title={email}>
              {email}
            </span>
            <form action={logout}>
              <button
                type="submit"
                className="inline-flex h-9 items-center gap-2 rounded-full border border-white/15 px-3 text-sm font-medium text-muted transition-colors hover:border-white/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/70"
              >
                <LogOut className="size-4" aria-hidden />
                <span>Salir</span>
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="container-page py-8 sm:py-10">{children}</main>
    </div>
  );
}
