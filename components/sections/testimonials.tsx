import { Star } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";

const STATS = [
  { value: "+80", label: "Proyectos entregados" },
  { value: "98%", label: "Clientes satisfechos" },
  { value: "+120%", label: "Conversiones promedio" },
  { value: "24/7", label: "Soporte disponible" },
];

const TESTIMONIALS = [
  {
    quote:
      "RedCode transformó por completo nuestra presencia digital. La web no solo se ve increíble, sino que las ventas se dispararon desde el primer mes.",
    name: "María Fernández",
    role: "CEO, Nova Store",
    initials: "MF",
  },
  {
    quote:
      "Profesionales de principio a fin. Entendieron nuestra visión y la llevaron más lejos de lo que imaginábamos. Totalmente recomendados.",
    name: "Carlos Rivas",
    role: "Fundador, Altura Studio",
    initials: "CR",
  },
  {
    quote:
      "Rápidos, atentos y con un ojo para el detalle impresionante. Nuestra landing convierte tres veces más que la anterior.",
    name: "Lucía Gómez",
    role: "Marketing, Verde Market",
    initials: "LG",
  },
];

export function Testimonials() {
  return (
    <section className="relative py-24 md:py-32">
      <div className="container-page">
        {/* Stats band */}
        <Reveal>
          <div className="grid gap-6 rounded-3xl border border-border bg-surface p-8 sm:grid-cols-2 sm:p-10 lg:grid-cols-4">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center sm:text-left">
                <div className="text-4xl font-bold tracking-tight text-gradient-brand">
                  {stat.value}
                </div>
                <div className="mt-2 text-sm text-muted">{stat.label}</div>
              </div>
            ))}
          </div>
        </Reveal>

        <SectionHeading
          className="mt-24"
          eyebrow="Testimonios"
          title="Lo que dicen nuestros clientes"
          description="La confianza de quienes ya crecieron con nosotros es nuestra mejor carta de presentación."
        />

        <RevealGroup className="mt-16 grid gap-5 lg:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <RevealItem key={t.name}>
              <figure className="flex h-full flex-col rounded-2xl border border-border bg-surface p-7">
                <div className="flex gap-1 text-brand-500">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="size-4 fill-current" />
                  ))}
                </div>
                <blockquote className="mt-5 flex-1 text-pretty text-[15px] leading-relaxed text-foreground/90">
                  “{t.quote}”
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3 border-t border-border pt-5">
                  <span className="grid size-11 place-items-center rounded-full bg-brand-600/15 text-sm font-bold text-brand-400 ring-1 ring-inset ring-brand-600/30">
                    {t.initials}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">
                      {t.name}
                    </span>
                    <span className="block text-xs text-muted-2">{t.role}</span>
                  </span>
                </figcaption>
              </figure>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
