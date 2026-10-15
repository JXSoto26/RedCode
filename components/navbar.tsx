"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { hasContact, quoteCtaHref, site } from "@/lib/site";
import { PROJECTS } from "@/lib/projects";

// Links to sections that are hidden until their data exists are filtered out.
const NAV_LINKS = [
  { label: "Inicio", href: "/#inicio", show: true },
  { label: "Servicios", href: "/#servicios", show: true },
  { label: "Para quién", href: "/#para-quien", show: true },
  { label: "Proyectos", href: "/#proyectos", show: PROJECTS.length > 0 },
  { label: "Cómo trabajo", href: "/#proceso", show: true },
  { label: "Cotización", href: "/#cotizacion", show: true },
  { label: "Contacto", href: "/#contacto", show: hasContact },
].filter((link) => link.show);

export function Navbar({ quoteEnabled = false }: { quoteEnabled?: boolean }) {
  const ctaHref = quoteCtaHref(quoteEnabled);
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div
        className={cn(
          "transition-all duration-300",
          scrolled
            ? "border-b border-border bg-background/80 backdrop-blur-xl"
            : "border-b border-transparent bg-transparent"
        )}
      >
        <nav className="container-page flex h-16 items-center justify-between md:h-18">
          <Link href="/#inicio" aria-label={`${site.name}, ir al inicio`}>
            <Logo />
          </Link>

          <ul className="hidden items-center gap-1 lg:flex">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="rounded-full px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          {ctaHref && (
            <div className="hidden items-center gap-3 lg:flex">
              <Button asChild size="sm">
                <a href={ctaHref}>Solicita una cotización</a>
              </Button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={open}
            aria-controls="mobile-menu"
            className="grid size-10 place-items-center rounded-lg text-foreground transition-colors hover:bg-white/5 lg:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </nav>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            id="mobile-menu"
            className="overflow-hidden border-b border-border bg-background/95 backdrop-blur-xl lg:hidden"
          >
            <ul className="container-page flex flex-col gap-1 py-4">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-4 py-3 text-base font-medium text-muted transition-colors hover:bg-white/5 hover:text-foreground"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              {ctaHref && (
                <li className="mt-2 px-1">
                  <Button asChild className="w-full" size="md">
                    <a href={ctaHref} onClick={() => setOpen(false)}>
                      Solicita una cotización
                    </a>
                  </Button>
                </li>
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
