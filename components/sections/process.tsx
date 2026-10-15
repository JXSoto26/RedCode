import { MessagesSquare, FileText, PenTool, CheckCircle2 } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { RevealGroup, RevealItem } from "@/components/motion/reveal";

const STEPS = [
  {
    icon: MessagesSquare,
    step: "01",
    title: "Conversación inicial",
    desc: "Me cuentas sobre tu negocio u organización, a quién quieres llegar y qué debe tener tu página.",
  },
  {
    icon: FileText,
    step: "02",
    title: "Propuesta",
    desc: "Preparo una cotización con el alcance del proyecto según lo que conversamos.",
  },
  {
    icon: PenTool,
    step: "03",
    title: "Diseño y desarrollo",
    desc: "Diseño y construyo la página, y te muestro el avance para que puedas darme tus comentarios.",
  },
  {
    icon: CheckCircle2,
    step: "04",
    title: "Revisión y entrega",
    desc: "Revisamos juntos la página en celular y computadora antes de darla por terminada.",
  },
];

export function Process() {
  return (
    <section id="proceso" className="relative py-24 md:py-32">
      <div className="container-page">
        <SectionHeading
          eyebrow="Cómo trabajo"
          title="Un proceso sencillo, de principio a fin"
          description="Trabajas directamente conmigo en cada etapa, sin intermediarios."
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
