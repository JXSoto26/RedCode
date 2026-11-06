import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { ProjectShowcase } from "@/components/projects/project-showcase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PROJECTS, projectBySlug } from "@/lib/projects";
import { isQuoteSubmissionEnabled } from "@/lib/quote/config";
import { quoteCtaHref, site } from "@/lib/site";

type Params = { params: Promise<{ slug: string }> };

/** One static page per real project; any other slug is a 404. */
export const dynamicParams = false;
export const generateStaticParams = () => PROJECTS.map((p) => ({ slug: p.slug }));

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const project = projectBySlug((await params).slug);
  if (!project) return {};
  const title = `${project.title}: ${project.category.toLowerCase()}`;
  const path = `/proyectos/${project.slug}`;
  return {
    title,
    description: project.desc,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      title: `${title} · ${site.name}`,
      description: project.desc,
      url: path,
      images: [{ url: project.images.desktop.src, width: project.images.desktop.width, height: project.images.desktop.height, alt: project.images.desktop.alt }],
    },
  };
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-brand-400">{title}</h2>
      <p className="mt-3 text-pretty leading-relaxed text-foreground/90">{children}</p>
    </div>
  );
}

export default async function ProjectPage({ params }: Params) {
  const project = projectBySlug((await params).slug);
  if (!project) notFound();

  const quoteEnabled = isQuoteSubmissionEnabled();
  const ctaHref = quoteCtaHref(quoteEnabled);
  const { caseStudy } = project;

  return (
    <>
      <Navbar quoteEnabled={quoteEnabled} />
      <main className="relative pt-28 pb-24 md:pt-36">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-radial-brand" />
        <div className="container-page relative">
          <Link
            href="/#proyectos"
            className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Proyectos
          </Link>

          {/* Intro */}
          <header className="mt-8 grid items-center gap-12 lg:grid-cols-[1fr_1.2fr]">
            <div className="min-w-0">
              <Badge>Caso de estudio</Badge>
              <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-brand-400">{project.category}</p>
              <h1 className="mt-3 text-balance text-4xl font-bold tracking-tight sm:text-5xl">{project.title}</h1>
              <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted">{caseStudy.intro}</p>
              {project.href && (
                <div className="mt-8 flex flex-wrap gap-3">
                  <Button asChild>
                    <a href={project.href} target="_blank" rel="noopener noreferrer">
                      Visitar sitio
                      <ArrowUpRight aria-hidden />
                      <span className="sr-only"> de {project.title} (abre en una pestaña nueva)</span>
                    </a>
                  </Button>
                </div>
              )}
            </div>
            <ProjectShowcase project={project} priority />
          </header>

          {/* Goal, need, solution */}
          <section aria-label="Resumen del proyecto" className="mt-20 grid gap-5 md:grid-cols-3">
            <Block title="Objetivo">{caseStudy.goal}</Block>
            <Block title="La necesidad">{caseStudy.need}</Block>
            <Block title="La solución">{caseStudy.solution}</Block>
          </section>

          {/* Features */}
          <section aria-labelledby="funcionalidades" className="mt-20 grid gap-10 lg:grid-cols-[1fr_2fr]">
            <div>
              <h2 id="funcionalidades" className="text-balance text-3xl font-bold tracking-tight">
                Qué incluye el sitio
              </h2>
              <p className="mt-4 text-pretty leading-relaxed text-muted">
                Funcionalidades disponibles hoy en el sitio de {project.title}.
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {caseStudy.features.map((f) => (
                <li key={f} className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 text-sm leading-relaxed">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand-400" aria-hidden />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Live site + credit */}
          {project.href && (
            <p className="mt-16 text-sm text-muted">
              Sitio en línea:{" "}
              <a
                href={project.href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand-300 underline underline-offset-4 hover:text-brand-200"
              >
                {new URL(project.href).host}
                <span className="sr-only"> (abre en una pestaña nueva)</span>
              </a>
              . Diseño y desarrollo: {site.name}.
            </p>
          )}

          {/* CTA */}
          {ctaHref && (
            <section
              aria-labelledby="cta-proyecto"
              className="mt-20 overflow-hidden rounded-3xl border border-brand-600/30 bg-gradient-to-br from-brand-600/15 via-surface to-surface p-8 sm:p-12"
            >
              <h2 id="cta-proyecto" className="max-w-2xl text-balance text-2xl font-bold tracking-tight sm:text-3xl">
                ¿Quieres un sitio así para tu negocio u organización?
              </h2>
              <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted">
                Cuéntanos qué necesitas y te preparamos una cotización según el alcance de tu proyecto.
              </p>
              <Button asChild size="lg" className="mt-8">
                <Link href={ctaHref}>
                  Solicitar cotización
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            </section>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
