import { Store, UserRound, Church } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { RevealGroup, RevealItem } from "@/components/motion/reveal";

const AUDIENCES = [
  {
    icon: Store,
    title: "Pequeños negocios",
    desc: "Muestra tus productos o servicios, tu horario y tu ubicación en un solo lugar, listo para compartir con tus clientes.",
  },
  {
    icon: UserRound,
    title: "Profesionales independientes",
    desc: "Presenta tu experiencia y lo que ofreces con una página propia que puedes enviar a quien pregunte por tu trabajo.",
  },
  {
    icon: Church,
    title: "Iglesias",
    desc: "Comparte horarios de servicio, actividades y formas de contacto con tu congregación y con quienes quieren visitarte.",
  },
];

export function Audience() {
  return (
    <section id="para-quien" className="relative py-24 md:py-32">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="container-page">
        <SectionHeading
          eyebrow="Para quién"
          title="Pensado para negocios y organizaciones en Puerto Rico"
          description="No necesitas conocimientos técnicos. Te explico cada paso en palabras sencillas, desde la primera conversación hasta la entrega."
        />

        <RevealGroup className="mt-16 grid gap-5 lg:grid-cols-3">
          {AUDIENCES.map((item) => (
            <RevealItem key={item.title}>
              <article className="flex h-full flex-col rounded-2xl border border-border bg-surface p-7">
                <span className="grid size-12 place-items-center rounded-xl border border-brand-600/25 bg-brand-600/10 text-brand-500">
                  <item.icon className="size-6" />
                </span>
                <h3 className="mt-5 text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {item.desc}
                </p>
              </article>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
