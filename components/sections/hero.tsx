"use client";

import { motion } from "motion/react";
import { ArrowRight, MessageCircle, Palette, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BrowserMockup } from "@/components/browser-mockup";
import { quoteCtaHref, site } from "@/lib/site";

const FEATURES = [
  {
    icon: Palette,
    title: "Diseño claro",
    desc: "Tus servicios presentados de forma ordenada y fácil de leer.",
  },
  {
    icon: Smartphone,
    title: "Pensada para celulares",
    desc: "Se adapta a celulares, tabletas y computadoras.",
  },
  {
    icon: MessageCircle,
    title: "Contacto sencillo",
    desc: "Tus clientes encuentran rápido cómo comunicarse contigo.",
  },
];

const ease = [0.22, 1, 0.36, 1] as const;

export function Hero({ quoteEnabled = false }: { quoteEnabled?: boolean }) {
  const ctaHref = quoteCtaHref(quoteEnabled);
  return (
    <section
      id="inicio"
      className="relative overflow-hidden pt-28 pb-20 md:pt-36 md:pb-28"
    >
      {/* Backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-grid mask-fade-b opacity-60" />
      <div className="pointer-events-none absolute inset-0 bg-radial-brand" />
      <div className="pointer-events-none absolute -top-40 right-0 h-[500px] w-[500px] rounded-full bg-brand-600/20 blur-[140px]" />

      <div className="container-page relative grid items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
        {/* Copy */}
        <div className="flex flex-col items-start">
          <motion.div
            data-reveal
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease }}
          >
            <Badge>Diseño web en {site.location}</Badge>
          </motion.div>

          <motion.h1
            data-reveal
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease, delay: 0.08 }}
            className="mt-6 text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
          >
            Una página web clara para{" "}
            <span className="text-gradient-brand">presentar tu negocio</span> y
            conectar con tus clientes
          </motion.h1>

          <motion.p
            data-reveal
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease, delay: 0.16 }}
            className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted"
          >
            Soy {site.owner} y en {site.name} diseño y desarrollo páginas web
            modernas y adaptadas a celulares para pequeños negocios,
            profesionales independientes e iglesias en {site.location}.
          </motion.p>

          <motion.div
            data-reveal
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease, delay: 0.24 }}
            className="mt-8 flex flex-col gap-3 sm:flex-row"
          >
            {ctaHref ? (
              <>
                <Button asChild size="lg">
                  <a href={ctaHref}>
                    Solicita una cotización <ArrowRight className="size-4" />
                  </a>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <a href="#servicios">Ver servicios</a>
                </Button>
              </>
            ) : (
              <>
                <Button asChild size="lg">
                  <a href="#servicios">
                    Ver servicios <ArrowRight className="size-4" />
                  </a>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <a href="#proceso">Cómo trabajo</a>
                </Button>
              </>
            )}
          </motion.div>

          <motion.dl
            data-reveal
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease, delay: 0.32 }}
            className="mt-12 grid w-full gap-6 sm:grid-cols-3"
          >
            {FEATURES.map((f) => (
              <div key={f.title} className="flex flex-col gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-9 place-items-center rounded-lg border border-brand-600/30 bg-brand-600/10 text-brand-400">
                    <f.icon className="size-4.5" />
                  </span>
                  <dt className="text-sm font-semibold">{f.title}</dt>
                </div>
                <dd className="text-sm leading-relaxed text-muted-2">
                  {f.desc}
                </dd>
              </div>
            ))}
          </motion.dl>
        </div>

        {/* Visual */}
        <motion.div
            data-reveal
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.8, ease, delay: 0.2 }}
          className="relative"
        >
          <div className="absolute -inset-6 -z-10 rounded-3xl bg-brand-600/20 blur-3xl" />
          <BrowserMockup />
        </motion.div>
      </div>
    </section>
  );
}
