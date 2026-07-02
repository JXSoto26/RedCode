import { AtSign, Camera, Briefcase, Terminal } from "lucide-react";
import { Logo } from "@/components/logo";

const FOOTER_LINKS = [
  {
    title: "Servicios",
    links: [
      { label: "Páginas Web", href: "#servicios" },
      { label: "Tiendas Online", href: "#servicios" },
      { label: "Landing Pages", href: "#servicios" },
      { label: "Desarrollo a Medida", href: "#servicios" },
    ],
  },
  {
    title: "Compañía",
    links: [
      { label: "Proyectos", href: "#proyectos" },
      { label: "Proceso", href: "#proceso" },
      { label: "Precios", href: "#precios" },
      { label: "Contacto", href: "#contacto" },
    ],
  },
  {
    title: "Recursos",
    links: [
      { label: "Blog", href: "#" },
      { label: "Preguntas frecuentes", href: "#" },
      { label: "Términos", href: "#" },
      { label: "Privacidad", href: "#" },
    ],
  },
];

const SOCIALS = [
  { icon: AtSign, href: "#", label: "X / Twitter" },
  { icon: Camera, href: "#", label: "Instagram" },
  { icon: Briefcase, href: "#", label: "LinkedIn" },
  { icon: Terminal, href: "#", label: "GitHub" },
];

export function Footer() {
  return (
    <footer className="relative border-t border-border bg-surface/40">
      <div className="container-page py-16">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          {/* Brand */}
          <div className="max-w-sm">
            <Logo />
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Creamos páginas web modernas, rápidas y diseñadas para hacer crecer
              tu negocio. Transformamos ideas en experiencias que generan
              resultados.
            </p>
            <div className="mt-6 flex gap-2">
              {SOCIALS.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  className="grid size-10 place-items-center rounded-lg border border-border text-muted transition-colors hover:border-brand-600/40 hover:bg-brand-600/10 hover:text-brand-400"
                >
                  <social.icon className="size-4.5" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {FOOTER_LINKS.map((column) => (
            <div key={column.title}>
              <h3 className="text-sm font-semibold text-foreground">
                {column.title}
              </h3>
              <ul className="mt-4 flex flex-col gap-3">
                {column.links.map((link) => (
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
            © {new Date().getFullYear()} RedCode. Todos los derechos reservados.
          </p>
          <p className="text-sm text-muted-2">
            Hecho con <span className="text-brand-500">♥</span> y Next.js
          </p>
        </div>
      </div>
    </footer>
  );
}
