import { Mail, MapPin, MessageCircle, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion/reveal";
import { emailHref, hasContact, site, whatsappHref } from "@/lib/site";

const CONTACT_INFO = [
  { icon: UserRound, label: "Atención", value: `Directa con ${site.owner}` },
  { icon: MapPin, label: "Ubicación", value: site.location },
];

/**
 * Direct WhatsApp / email contact. Renders nothing until at least one contact
 * method is configured in lib/site.ts, so no placeholder links go public.
 */
export function Contact() {
  if (!hasContact) return null;

  return (
    <section id="contacto" className="relative py-24 md:py-32">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="container-page">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left: pitch + info */}
          <Reveal className="flex flex-col">
            <Badge className="self-start">Contacto</Badge>
            <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
              Hablemos de tu{" "}
              <span className="text-gradient-brand">página web</span>
            </h2>
            <p className="mt-5 max-w-md text-pretty text-base leading-relaxed text-muted sm:text-lg">
              Cuéntame qué necesitas y te preparo una cotización según el
              alcance de tu proyecto.
            </p>

            <dl className="mt-10 grid gap-5 sm:grid-cols-2">
              {CONTACT_INFO.map((item) => (
                <div key={item.label} className="flex items-center gap-3.5">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-brand-600/25 bg-brand-600/10 text-brand-400">
                    <item.icon className="size-5" />
                  </span>
                  <div>
                    <dt className="text-xs uppercase tracking-widest text-muted-2">
                      {item.label}
                    </dt>
                    <dd className="mt-0.5 text-sm font-medium text-foreground">
                      {item.value}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          </Reveal>

          {/* Right: direct contact options */}
          <Reveal delay={0.1}>
            <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-7 sm:p-8">
              <h3 className="text-xl font-semibold">Escríbeme directamente</h3>
              <p className="text-sm leading-relaxed text-muted">
                Elige el medio que te resulte más cómodo.
              </p>

              {whatsappHref && (
                <Button asChild size="lg" className="mt-2 w-full">
                  <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="size-4" /> Escribir por WhatsApp
                    <span className="sr-only"> (abre en una pestaña nueva)</span>
                  </a>
                </Button>
              )}

              {emailHref && (
                <Button
                  asChild
                  size="lg"
                  variant={whatsappHref ? "secondary" : "primary"}
                  className="w-full"
                >
                  <a href={emailHref}>
                    <Mail className="size-4" /> Enviar un email
                  </a>
                </Button>
              )}

              {site.contact.email && (
                <p className="text-center text-sm text-muted-2">
                  {site.contact.email}
                </p>
              )}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
