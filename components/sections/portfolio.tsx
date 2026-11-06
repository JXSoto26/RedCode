import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { Reveal } from "@/components/motion/reveal";
import { ProjectShowcase } from "@/components/projects/project-showcase";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import { PROJECTS } from "@/lib/projects";
import { cn } from "@/lib/utils";

/**
 * Real projects only, each one presented in full (screenshots, what it
 * includes, case study and live site). Hidden while there are none.
 */
export function Portfolio() {
  if (PROJECTS.length === 0) return null;

  return (
    <section id="proyectos" className="relative py-24 md:py-32">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="container-page">
        <SectionHeading
          eyebrow="Portafolio"
          title="Proyectos realizados"
          description="Sitios que hemos diseñado y desarrollado para negocios y organizaciones reales."
        />

        <div className="mt-16 flex flex-col gap-20">
          {PROJECTS.map((project, i) => (
            <article
              key={project.slug}
              aria-labelledby={`proyecto-${project.slug}`}
              className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-14"
            >
              <Reveal className={cn("min-w-0", i % 2 === 1 && "lg:order-2")}>
                <ProjectShowcase project={project} />
              </Reveal>

              <Reveal delay={0.1} className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-widest text-brand-400">{project.category}</p>
                <h3 id={`proyecto-${project.slug}`} className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
                  {project.title}
                </h3>
                <p className="mt-4 text-pretty leading-relaxed text-muted">{project.desc}</p>

                <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
                  {project.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2 text-sm text-foreground/90">
                      <Check className="mt-0.5 size-4 shrink-0 text-brand-400" aria-hidden />
                      {h}
                    </li>
                  ))}
                </ul>

                <p className="mt-6 text-sm text-muted-2">Diseño y desarrollo: RedCode Web Design Studio.</p>

                <div className="mt-8 flex flex-wrap gap-3">
                  <Button asChild>
                    <Link href={`/proyectos/${project.slug}`}>
                      Ver proyecto
                      <ArrowRight aria-hidden />
                      <span className="sr-only">: {project.title}</span>
                    </Link>
                  </Button>
                  {project.href && (
                    <Button asChild variant="secondary">
                      <a href={project.href} target="_blank" rel="noopener noreferrer">
                        Visitar sitio
                        <ArrowUpRight aria-hidden />
                        <span className="sr-only"> de {project.title} (abre en una pestaña nueva)</span>
                      </a>
                    </Button>
                  )}
                </div>
              </Reveal>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
