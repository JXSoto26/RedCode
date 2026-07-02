"use client";

import { motion } from "motion/react";
import { ArrowRight, Gauge, Palette, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BrowserMockup } from "@/components/browser-mockup";

const FEATURES = [
  {
    icon: Palette,
    title: "Diseño Moderno",
    desc: "Interfaces atractivas y fáciles de usar.",
  },
  {
    icon: Gauge,
    title: "Rendimiento Óptimo",
    desc: "Páginas rápidas que mejoran la experiencia.",
  },
  {
    icon: Smartphone,
    title: "100% Responsivas",
    desc: "Tu web se verá perfecta en cualquier dispositivo.",
  },
];

const ease = [0.22, 1, 0.36, 1] as const;

export function Hero() {
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
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease }}
          >
            <Badge>Desarrollo web a medida</Badge>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease, delay: 0.08 }}
            className="mt-6 text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
          >
            Transformamos ideas en{" "}
            <span className="text-gradient-brand">experiencias web</span> que
            generan resultados
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease, delay: 0.16 }}
            className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted"
          >
            En RedCode creamos páginas web modernas, rápidas y diseñadas para
            hacer crecer tu negocio.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease, delay: 0.24 }}
            className="mt-8 flex flex-col gap-3 sm:flex-row"
          >
            <Button asChild size="lg">
              <a href="#contacto">
                Cotiza tu proyecto <ArrowRight className="size-4" />
              </a>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <a href="#proyectos">Ver proyectos</a>
            </Button>
          </motion.div>

          <motion.dl
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
