import { Logo } from "@/components/logo";
import { hasContact, site } from "@/lib/site";
import { PROJECTS } from "@/lib/projects";
import { isQuoteSubmissionEnabled } from "@/lib/quote/config";

const FOOTER_LINKS = [
  {
    title: "Servicios",
    links: [
      { label: "Páginas web informativas", href: "/#servicios", show: true },
      { label: "Landing pages", href: "/#servicios", show: true },
      { label: "Rediseño de páginas web", href: "/#servicios", show: true },
    ],
  },
  {
    title: "Navegación",
    links: [
      { label: "Para quién", href: "/#para-quien", show: true },
      { label: "Proyectos", href: "/#proyectos", show: PROJECTS.length > 0 },
      { label: "Cómo trabajo", href: "/#proceso", show: true },
      { label: "Cotización", href: "/#cotizacion", show: true },
      { label: "Solicitar cotización", href: "/cotizar", show: isQuoteSubmissionEnabled() },
      { label: "Contacto", href: "/#contacto", show: hasContact },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative border-t border-border bg-surface/40">
      <div className="container-page py-16">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
          {/* Brand */}
          <div className="max-w-sm sm:col-span-2 lg:col-span-1">
            <Logo />
            <p className="mt-4 text-sm leading-relaxed text-muted">
              {site.name} es un estudio independiente de diseño web en{" "}
              {site.location}, dirigido por {site.owner}.
            </p>
            {site.socials.length > 0 && (
              <ul className="mt-6 flex flex-wrap gap-x-4 gap-y-2">
                {site.socials.map((social) => (
                  <li key={social.href}>
                    <a
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-muted transition-colors hover:text-brand-400"
                    >
                      {social.label}
                      <span className="sr-only"> (abre en una pestaña nueva)</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Link columns */}
          {FOOTER_LINKS.map((column) => (
            <div key={column.title}>
              <h2 className="text-sm font-semibold text-foreground">
                {column.title}
              </h2>
              <ul className="mt-4 flex flex-col gap-3">
                {column.links
                  .filter((link) => link.show)
                  .map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-sm text-muted transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 sm:flex-row">
          <p className="text-sm text-muted-2">
            © {new Date().getFullYear()} {site.name}. Todos los derechos
            reservados.
          </p>
          <div className="flex items-center gap-4 text-sm text-muted-2">
            <a href="/privacidad" className="transition-colors hover:text-foreground">
              Privacidad
            </a>
            <span aria-hidden="true">·</span>
            <p>Hecho en {site.location}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
