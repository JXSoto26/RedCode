import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { RevealGroup, RevealItem } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";
import { PROJECTS } from "@/lib/projects";

const FALLBACK_GRADIENTS = [
  "from-brand-600/40 via-brand-800/30 to-background",
  "from-rose-500/30 via-brand-900/30 to-background",
  "from-orange-500/25 via-brand-800/30 to-background",
  "from-brand-500/35 via-brand-900/25 to-background",
];

export function Portfolio() {
  if (PROJECTS.length === 0) return null;

  return (
    <section id="proyectos" className="relative py-24 md:py-32">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="container-page">
        <SectionHeading
          eyebrow="Portafolio"
          title="Proyectos realizados"
          description="Algunas de las páginas que he diseñado y desarrollado."
        />

        <RevealGroup className="mt-16 grid gap-5 md:grid-cols-2">
          {PROJECTS.map((project, i) => (
            <RevealItem key={project.title}>
              <article className="group relative overflow-hidden rounded-2xl border border-border bg-surface transition-colors duration-300 hover:border-brand-600/40 focus-within:ring-2 focus-within:ring-brand-500/70">
                {/* Thumbnail */}
                <div
                  className={cn(
                    "relative aspect-[16/10] overflow-hidden bg-gradient-to-br",
                    FALLBACK_GRADIENTS[i % FALLBACK_GRADIENTS.length]
                  )}
                >
                  {project.image ? (
                    <Image
                      src={project.image}
                      alt={`Captura de la página de ${project.title}`}
                      fill
                      sizes="(min-width: 768px) 50vw, 100vw"
                      className="object-cover object-top"
                    />
                  ) : (
                    <>
                      <div className="absolute inset-0 bg-grid opacity-40" />
                      <div className="absolute inset-0 grid place-items-center">
                        <span className="font-mono text-2xl font-bold tracking-tight text-white/90 sm:text-3xl">
                          {project.title}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="absolute inset-0 bg-background/0 transition-colors duration-300 group-hover:bg-background/20" />
                </div>

                {/* Meta */}
                <div className="flex items-start justify-between gap-4 p-6">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-widest text-brand-400">
                      {project.category}
                    </span>
                    <h3 className="mt-2 text-lg font-semibold">
                      {project.href ? (
                        <a
                          href={project.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="after:absolute after:inset-0 focus-visible:outline-none"
                        >
                          {project.title}
                          <span className="sr-only"> (abre en una pestaña nueva)</span>
                        </a>
                      ) : (
                        project.title
                      )}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">
                      {project.desc}
                    </p>
                  </div>
                  {project.href && (
                    <span className="mt-1 grid size-9 shrink-0 place-items-center rounded-full border border-border text-muted transition-all duration-300 group-hover:border-brand-600/50 group-hover:bg-brand-600/10 group-hover:text-brand-400">
                      <ArrowUpRight className="size-4.5" />
                    </span>
                  )}
                </div>
              </article>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
