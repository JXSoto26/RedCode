import { Globe, MonitorSmartphone, RefreshCw } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { RevealGroup, RevealItem } from "@/components/motion/reveal";

const SERVICES = [
  {
    icon: Globe,
    title: "Páginas web informativas",
    desc: "Una página para presentar tu negocio, organización o trabajo: quién eres, qué ofreces y cómo comunicarse contigo.",
  },
  {
    icon: MonitorSmartphone,
    title: "Landing pages",
    desc: "Una página enfocada en un solo servicio, producto o campaña, con la información necesaria y un paso claro para contactarte.",
  },
  {
    icon: RefreshCw,
    title: "Rediseño de páginas web",
    desc: "Si tu página actual se ve anticuada o es difícil de usar en el celular, la renuevo con un diseño más claro y actual.",
  },
];

export function Services() {
  return (
    <section id="servicios" className="relative py-24 md:py-32">
      <div className="container-page">
        <SectionHeading
          eyebrow="Servicios"
          title="Páginas web hechas a la medida de tu negocio"
          description="Cada página se diseña y desarrolla según lo que necesitas comunicar, para que tus clientes entiendan rápido qué ofreces."
        />

        <RevealGroup className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((service) => (
            <RevealItem key={service.title}>
              <article className="group relative h-full overflow-hidden rounded-2xl border border-border bg-surface p-7 transition-all duration-300 hover:border-brand-600/40 hover:bg-surface-2">
                <div className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-brand-600/10 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
                <span className="grid size-12 place-items-center rounded-xl border border-brand-600/25 bg-brand-600/10 text-brand-500 transition-transform duration-300 group-hover:scale-110">
                  <service.icon className="size-6" />
                </span>
                <h3 className="mt-5 text-lg font-semibold">{service.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {service.desc}
                </p>
              </article>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
