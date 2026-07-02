import { Check } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { Button } from "@/components/ui/button";
import { RevealGroup, RevealItem } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    name: "Esencial",
    price: "$399",
    tagline: "Ideal para lanzar tu presencia online.",
    features: [
      "Landing page de una sección",
      "Diseño responsive a medida",
      "Formulario de contacto",
      "Optimización SEO básica",
      "Entrega en 5 días",
    ],
    featured: false,
    cta: "Empezar",
  },
  {
    name: "Profesional",
    price: "$899",
    tagline: "Para negocios que quieren destacar y crecer.",
    features: [
      "Sitio web de hasta 6 secciones",
      "Diseño premium personalizado",
      "Animaciones e interacciones",
      "SEO técnico avanzado",
      "Integración con analytics",
      "1 mes de soporte incluido",
    ],
    featured: true,
    cta: "Cotizar ahora",
  },
  {
    name: "Empresa",
    price: "A medida",
    tagline: "Plataformas y soluciones a la medida.",
    features: [
      "E-commerce o app web completa",
      "Funcionalidades personalizadas",
      "Panel de administración",
      "Integraciones con APIs",
      "Escalabilidad garantizada",
      "Soporte y mantenimiento continuo",
    ],
    featured: false,
    cta: "Hablar con ventas",
  },
];

export function Pricing() {
  return (
    <section id="precios" className="relative py-24 md:py-32">
      <div className="pointer-events-none absolute inset-0 bg-radial-brand opacity-50" />
      <div className="container-page relative">
        <SectionHeading
          eyebrow="Precios"
          title="Planes claros, sin sorpresas"
          description="Elige el punto de partida que mejor se ajuste a tu proyecto. Todo es personalizable."
        />

        <RevealGroup className="mt-16 grid items-stretch gap-5 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <RevealItem key={plan.name} className="h-full">
              <div
                className={cn(
                  "relative flex h-full flex-col rounded-2xl border p-8 transition-colors",
                  plan.featured
                    ? "border-brand-600/60 bg-surface-2 shadow-[0_0_60px_-15px_rgba(240,30,44,0.45)]"
                    : "border-border bg-surface"
                )}
              >
                {plan.featured && (
                  <span className="absolute -top-3 left-8 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                    Más popular
                  </span>
                )}

                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="mt-2 text-sm text-muted">{plan.tagline}</p>

                <div className="mt-6 flex items-baseline gap-1.5">
                  <span className="text-4xl font-bold tracking-tight">
                    {plan.price}
                  </span>
                  {plan.price.startsWith("$") && (
                    <span className="text-sm text-muted-2">/ proyecto</span>
                  )}
                </div>

                <ul className="mt-8 flex flex-1 flex-col gap-3.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <span
                        className={cn(
                          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                          plan.featured
                            ? "bg-brand-600 text-white"
                            : "bg-brand-600/15 text-brand-400"
                        )}
                      >
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                      <span className="text-sm text-foreground/90">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  className="mt-8 w-full"
                  variant={plan.featured ? "primary" : "secondary"}
                >
                  <a href="#contacto">{plan.cta}</a>
                </Button>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
