import {
  Globe,
  ShoppingCart,
  MonitorSmartphone,
  Code2,
  Search,
  LifeBuoy,
} from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { RevealGroup, RevealItem } from "@/components/motion/reveal";

const SERVICES = [
  {
    icon: Globe,
    title: "Páginas Web",
    desc: "Sitios web modernos y profesionales para presentar tu negocio con impacto.",
  },
  {
    icon: ShoppingCart,
    title: "Tiendas Online",
    desc: "E-commerce seguros y optimizados para vender más y gestionar con facilidad.",
  },
  {
    icon: MonitorSmartphone,
    title: "Landing Pages",
    desc: "Páginas diseñadas para convertir visitantes en clientes reales.",
  },
  {
    icon: Code2,
    title: "Desarrollo a Medida",
    desc: "Soluciones personalizadas según las necesidades exactas de tu negocio.",
  },
  {
    icon: Search,
    title: "SEO & Posicionamiento",
    desc: "Optimización técnica para que te encuentren en Google y crezcas orgánicamente.",
  },
  {
    icon: LifeBuoy,
    title: "Soporte & Mantenimiento",
    desc: "Acompañamiento continuo para mantener tu web rápida, segura y actualizada.",
  },
];

export function Services() {
  return (
    <section id="servicios" className="relative py-24 md:py-32">
      <div className="container-page">
        <SectionHeading
          eyebrow="Nuestros servicios"
          title="Soluciones web para cada necesidad"
          description="Desde una landing page hasta una plataforma a medida, cubrimos todo el ciclo de vida de tu presencia digital."
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
