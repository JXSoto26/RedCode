import type { Metadata } from "next";
import { connection } from "next/server";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Badge } from "@/components/ui/badge";
import { QuoteForm } from "@/components/quote/quote-form";
import { isQuoteSubmissionEnabled, turnstileSiteKey } from "@/lib/quote/config";

export const metadata: Metadata = {
  title: "Solicitar cotización",
  description:
    "Cuéntame sobre tu negocio y tu proyecto para preparar una cotización de tu página web.",
  alternates: { canonical: "/cotizar" },
};

export default async function QuotePage() {
  // Read server configuration per request, not at build time.
  await connection();
  const enabled = isQuoteSubmissionEnabled();

  return (
    <>
      <Navbar quoteEnabled={enabled} />
      <main className="relative pt-28 pb-24 md:pt-36">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-radial-brand" />
        <div className="container-page relative mx-auto max-w-3xl">
          <Badge>Cotización</Badge>
          <h1 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            Solicita una <span className="text-gradient-brand">cotización</span>
          </h1>
          <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted sm:text-lg">
            Cuéntame sobre tu negocio y tu proyecto. Con esta información preparo una propuesta según
            lo que necesitas.
          </p>

          <div className="mt-10 rounded-2xl border border-border bg-surface p-5 sm:p-8">
            <noscript>
              <p className="mb-6 rounded-xl border border-brand-600/40 bg-brand-600/10 p-4 text-sm">
                Necesitas activar JavaScript en tu navegador para enviar este formulario.
              </p>
            </noscript>
            <QuoteForm enabled={enabled} turnstileSiteKey={enabled ? turnstileSiteKey() : null} />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
