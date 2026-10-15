import { ArrowRight, Check } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion/reveal";
import { quoteCtaHref } from "@/lib/site";

const FACTORS = [
  "Si es una página nueva o el rediseño de una existente.",
  "La cantidad de secciones o páginas que necesitas.",
  "El contenido: textos, fotos y otra información que debe incluir.",
];

export function Quote({ quoteEnabled = false }: { quoteEnabled?: boolean }) {
  const ctaHref = quoteCtaHref(quoteEnabled);
  return (
    <section id="cotizacion" className="relative py-24 md:py-32">
      <div className="pointer-events-none absolute inset-0 bg-radial-brand opacity-50" />
      <div className="container-page relative">
        <SectionHeading
          eyebrow="Cotización"
          title="Una propuesta según lo que necesitas"
          description="No trabajo con paquetes fijos. Cada proyecto se cotiza de acuerdo con su alcance."
        />

        <Reveal className="mx-auto mt-16 max-w-2xl">
          <div className="rounded-2xl border border-brand-600/60 bg-surface-2 p-8 shadow-[0_0_60px_-15px_rgba(240,30,44,0.45)] sm:p-10">
            <h3 className="text-lg font-semibold">
              ¿Qué tomo en cuenta para cotizar?
            </h3>

            <ul className="mt-6 flex flex-col gap-3.5">
              {FACTORS.map((factor) => (
                <li key={factor} className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  <span className="text-sm text-foreground/90">{factor}</span>
                </li>
              ))}
            </ul>

            <p className="mt-6 text-sm leading-relaxed text-muted">
              Después de conversar sobre tu proyecto, te envío una propuesta con
              lo que incluye y su costo antes de comenzar.
            </p>

            {ctaHref && (
              <Button asChild className="mt-8 w-full sm:w-auto">
                <a href={ctaHref}>
                  Solicitar cotización <ArrowRight className="size-4" />
                </a>
              </Button>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
