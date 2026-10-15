"use client";

import { motion } from "motion/react";
import { Smartphone } from "lucide-react";
import { Logo } from "@/components/logo";

/**
 * Pure-CSS browser window showing a miniature landing preview.
 * Used as the hero visual — no external image dependency. Decorative only,
 * so it is hidden from assistive technology.
 */
export function BrowserMockup() {
  return (
    <div className="relative" aria-hidden="true">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/50">
        {/* Title bar */}
        <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-4 py-3">
          <span className="size-3 rounded-full bg-brand-500/80" />
          <span className="size-3 rounded-full bg-white/15" />
          <span className="size-3 rounded-full bg-white/15" />
          <div className="ml-3 hidden flex-1 rounded-md border border-border bg-background/60 px-3 py-1 text-[10px] text-muted-2 sm:block">
            Vista previa
          </div>
        </div>

        {/* Preview content */}
        <div className="relative bg-radial-brand px-6 py-8 sm:px-8">
          <div className="flex items-center justify-between">
            <Logo className="scale-90" />
            <div className="hidden items-center gap-3 text-[10px] text-muted-2 sm:flex">
              <span>Inicio</span>
              <span>Servicios</span>
              <span>Proyectos</span>
              <span className="rounded bg-brand-600 px-2 py-1 text-white">
                Cotiza
              </span>
            </div>
          </div>

          <div className="mt-8 max-w-[80%]">
            <p className="text-xl font-bold leading-tight sm:text-2xl">
              Presenta tus servicios con una{" "}
              <span className="text-gradient-brand">página clara</span> y
              profesional
            </p>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-2">
              Información ordenada y fácil de encontrar desde cualquier
              dispositivo.
            </p>
            <div className="mt-4 flex gap-2">
              <span className="rounded-md bg-brand-600 px-3 py-1.5 text-[10px] font-semibold text-white">
                Contáctanos
              </span>
              <span className="rounded-md border border-border px-3 py-1.5 text-[10px] font-medium text-muted">
                Ver servicios
              </span>
            </div>
          </div>

          {/* faux service cards */}
          <div className="mt-8 grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-background/50 p-3"
              >
                <div className="h-1.5 w-8 rounded-full bg-brand-500/60" />
                <div className="mt-3 h-1 w-full rounded-full bg-white/10" />
                <div className="mt-2 h-1 w-2/3 rounded-full bg-white/10" />
                <div className="mt-2 h-1 w-5/6 rounded-full bg-white/10" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Floating mobile-friendly card */}
      <motion.div
        data-reveal
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.6 }}
        className="absolute -bottom-6 -left-6 hidden rounded-xl border border-border bg-surface-2/90 p-4 shadow-xl backdrop-blur sm:block"
      >
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-brand-600/15 text-brand-400">
            <Smartphone className="size-5" />
          </span>
          <div>
            <div className="text-sm font-bold leading-none">
              Adaptada a celulares
            </div>
            <div className="mt-1 text-[11px] text-muted-2">
              Se ve bien en cualquier pantalla
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
