"use client";

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mail, Phone, MapPin, Clock, ArrowRight, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

const CONTACT_INFO = [
  { icon: Mail, label: "Correo", value: "hola@redcode.dev" },
  { icon: Phone, label: "Teléfono", value: "+1 (829) 000-0000" },
  { icon: MapPin, label: "Ubicación", value: "100% remoto · LATAM" },
  { icon: Clock, label: "Respuesta", value: "En menos de 24 horas" },
];

const PROJECT_TYPES = [
  "Página web",
  "Tienda online",
  "Landing page",
  "Desarrollo a medida",
  "Otro",
];

const fieldClass =
  "w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-2 transition-colors focus:border-brand-600/60 focus:outline-none focus:ring-2 focus:ring-brand-600/20";

export function Contact() {
  const [submitted, setSubmitted] = React.useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // MVP: simulate submission. Wire up to an API route / email service later.
    setSubmitted(true);
  }

  return (
    <section id="contacto" className="relative py-24 md:py-32">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="container-page">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left: pitch + info */}
          <Reveal className="flex flex-col">
            <Badge>Contacto</Badge>
            <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
              Hagamos realidad tu{" "}
              <span className="text-gradient-brand">próximo proyecto</span>
            </h2>
            <p className="mt-5 max-w-md text-pretty text-base leading-relaxed text-muted sm:text-lg">
              Cuéntanos tu idea y te enviaremos una propuesta a medida. Sin
              compromiso y sin tecnicismos innecesarios.
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

          {/* Right: form */}
          <Reveal delay={0.1}>
            <div className="rounded-2xl border border-border bg-surface p-7 sm:p-8">
              <AnimatePresence mode="wait">
                {submitted ? (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center py-16 text-center"
                  >
                    <span className="grid size-16 place-items-center rounded-full bg-brand-600/15 text-brand-400">
                      <CheckCircle2 className="size-8" />
                    </span>
                    <h3 className="mt-5 text-xl font-semibold">
                      ¡Mensaje enviado!
                    </h3>
                    <p className="mt-2 max-w-xs text-sm text-muted">
                      Gracias por escribirnos. Nuestro equipo te contactará en
                      menos de 24 horas.
                    </p>
                    <Button
                      variant="ghost"
                      className="mt-6"
                      onClick={() => setSubmitted(false)}
                    >
                      Enviar otro mensaje
                    </Button>
                  </motion.div>
                ) : (
                  <motion.form
                    key="form"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onSubmit={handleSubmit}
                    className="flex flex-col gap-5"
                  >
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field label="Nombre" htmlFor="name">
                        <input
                          id="name"
                          name="name"
                          required
                          placeholder="Tu nombre"
                          className={fieldClass}
                        />
                      </Field>
                      <Field label="Correo" htmlFor="email">
                        <input
                          id="email"
                          name="email"
                          type="email"
                          required
                          placeholder="tucorreo@email.com"
                          className={fieldClass}
                        />
                      </Field>
                    </div>

                    <Field label="Tipo de proyecto" htmlFor="type">
                      <select
                        id="type"
                        name="type"
                        defaultValue=""
                        required
                        className={cn(fieldClass, "appearance-none")}
                      >
                        <option value="" disabled>
                          Selecciona una opción
                        </option>
                        {PROJECT_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Mensaje" htmlFor="message">
                      <textarea
                        id="message"
                        name="message"
                        required
                        rows={4}
                        placeholder="Cuéntanos sobre tu proyecto..."
                        className={cn(fieldClass, "resize-none")}
                      />
                    </Field>

                    <Button type="submit" size="lg" className="mt-1 w-full">
                      Enviar mensaje <ArrowRight className="size-4" />
                    </Button>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground/90">{label}</span>
      {children}
    </label>
  );
}
