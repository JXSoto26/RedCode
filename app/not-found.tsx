import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isQuoteSubmissionEnabled } from "@/lib/quote/config";
import { quoteCtaHref } from "@/lib/site";

export const metadata: Metadata = {
  title: "Página no encontrada",
  description: "La página que buscas no existe o cambió de dirección.",
};

/**
 * Spanish 404 page. It renders without Suspense or request data, so Next.js
 * answers with a real HTTP 404 (streamed not-found pages would answer 200).
 * Next.js adds noindex to it.
 */
export default function NotFound() {
  const quoteEnabled = isQuoteSubmissionEnabled();
  const ctaHref = quoteCtaHref(quoteEnabled);

  return (
    <>
      <Navbar quoteEnabled={quoteEnabled} />
      <main className="relative pt-28 pb-24 md:pt-36">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-radial-brand" />
        <div className="container-page relative mx-auto max-w-2xl text-center">
          <Badge>Error 404</Badge>
          <h1 className="mt-6 text-balance text-4xl font-bold tracking-tight sm:text-5xl">Página no encontrada</h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-lg leading-relaxed text-muted">
            La dirección no existe o cambió. Desde aquí puedes volver al inicio, ver nuestros proyectos o
            solicitar una cotización.
          </p>
          <nav aria-label="Enlaces útiles" className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/">Ir al inicio</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/#proyectos">Ver proyectos</Link>
            </Button>
            {ctaHref && (
              <Button asChild size="lg" variant="secondary">
                <Link href={ctaHref}>
                  Solicitar cotización
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            )}
          </nav>
        </div>
      </main>
      <Footer />
    </>
  );
}
