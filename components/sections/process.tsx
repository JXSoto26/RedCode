import { Search, PenTool, Code, Rocket } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { RevealGroup, RevealItem } from "@/components/motion/reveal";

const STEPS = [
  {
    icon: Search,
    step: "01",
    title: "Descubrimiento",
    desc: "Analizamos tu negocio, tus objetivos y tu audiencia para definir la estrategia correcta.",
  },
  {
    icon: PenTool,
    step: "02",
    title: "Diseño",
    desc: "Creamos una interfaz moderna y a medida, centrada en la experiencia de tus clientes.",
  },
  {
    icon: Code,
    step: "03",
    title: "Desarrollo",
    desc: "Construimos tu web con tecnología de punta: rápida, segura y escalable.",
  },
  {
    icon: Rocket,
    step: "04",
    title: "Lanzamiento",
    desc: "Publicamos, optimizamos y te acompañamos para que tu proyecto siga creciendo.",
  },
];

export function Process() {
  return (
    <section id="proceso" className="relative py-24 md:py-32">
      <div className="container-page">
        <SectionHeading
          eyebrow="Proceso de trabajo"
          title="Cómo damos vida a tu proyecto"
          description="Un método claro y transparente en cuatro etapas, de la idea al lanzamiento."
        />

        <RevealGroup className="relative mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <RevealItem key={step.step}>
              <div className="group relative h-full rounded-2xl border border-border bg-surface p-7">
                <div className="flex items-center justify-between">
                  <span className="grid size-12 place-items-center rounded-xl border border-brand-600/25 bg-brand-600/10 text-brand-500">
                    <step.icon className="size-6" />
                  </span>
                  <span className="font-mono text-4xl font-bold text-white/[0.06] transition-colors group-hover:text-brand-600/20">
                    {step.step}
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {step.desc}
                </p>

                {i < STEPS.length - 1 && (
                  <span className="absolute -right-2.5 top-1/2 hidden size-5 -translate-y-1/2 place-items-center text-border lg:grid">
                    <svg viewBox="0 0 20 20" className="size-5" fill="none">
                      <path
                        d="M7 4l6 6-6 6"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                )}
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
