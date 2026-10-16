"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ASSET_STATUSES,
  ASSETS,
  BUDGET_MAX_USD,
  BUSINESS_TYPES,
  CONSENT_TEXT,
  FEATURES,
  LIMITS,
  SECTIONS,
  SERVICES,
  type NotificationStatus,
} from "@/lib/quote/options";
import {
  EMPTY_FORM,
  errorsForStep,
  firstStepWithError,
  parseQuoteRequest,
  todayInPuertoRico,
  type FieldErrors,
  type QuoteFormValues,
} from "@/lib/quote/schema";
import { CheckboxField, ChoiceGroup, TextAreaField, TextField } from "./fields";
import { QuoteSummary, STEP_TITLES } from "./quote-summary";
import { TurnstileWidget, type TurnstileHandle } from "./turnstile-widget";

type Step = 1 | 2 | 3 | 4;

type Done = {
  reference: string;
  visitorEmail: NotificationStatus;
  values: QuoteFormValues;
};

const ENDPOINT = "/api/quote-requests";

const SUBMIT_ERRORS: Record<string, string> = {
  not_configured: "El envío de solicitudes no está disponible en este momento.",
  persist_failed:
    "No pude guardar tu solicitud por un problema del servidor. Tus datos siguen en el formulario; puedes intentarlo de nuevo.",
  rate_limited:
    "Se alcanzó el límite de solicitudes desde esta conexión o este email. Inténtalo de nuevo más tarde.",
  conflict: "No pude confirmar el envío. Revisa los datos y vuelve a enviarlos.",
  invalid: "Hay campos por corregir. Revisa los mensajes marcados.",
  network:
    "No pude confirmar el envío por un problema de conexión. Tus datos siguen aquí. Si lo intentas de nuevo, no se creará una solicitud duplicada.",
  generic: "No pude procesar la solicitud. Revisa los datos e inténtalo de nuevo.",
  challenge_missing: "Completa la verificación anti-spam antes de enviar.",
  challenge_failed:
    "La verificación anti-spam no es válida o caducó. Se generó una nueva: espera a que se complete y vuelve a enviar. Tus datos siguen aquí.",
  challenge_unavailable:
    "No se pudo comprobar la verificación anti-spam en este momento. Tus datos siguen aquí; inténtalo de nuevo en unos minutos.",
};

export function QuoteForm({
  enabled,
  turnstileSiteKey = null,
}: {
  enabled: boolean;
  turnstileSiteKey?: string | null;
}) {
  const [step, setStep] = React.useState<Step>(1);
  const [values, setValues] = React.useState<QuoteFormValues>(EMPTY_FORM);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [returnToSummary, setReturnToSummary] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<Done | null>(null);
  const [focusErrors, setFocusErrors] = React.useState(0);

  const formRef = React.useRef<HTMLFormElement>(null);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const honeypotRef = React.useRef<HTMLInputElement>(null);
  const startedAtRef = React.useRef(0);
  const submittingRef = React.useRef(false);
  const lastAttemptRef = React.useRef<{ payload: string; key: string } | null>(null);
  const navigatedRef = React.useRef(false);
  const turnstileRef = React.useRef<TurnstileHandle>(null);
  const [turnstileToken, setTurnstileToken] = React.useState<string | null>(null);

  React.useEffect(() => {
    startedAtRef.current = Date.now();
  }, []);

  // Move focus to the step heading after navigating (not on first load).
  React.useEffect(() => {
    if (navigatedRef.current) headingRef.current?.focus();
  }, [step, done]);

  // Focus the first invalid field after a failed validation.
  React.useEffect(() => {
    if (focusErrors === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusErrors]);

  const update = <K extends keyof QuoteFormValues>(key: K, value: QuoteFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const toggle = (key: "sections" | "features", value: string, checked: boolean) => {
    const current = values[key] as string[];
    update(key, (checked ? [...current, value] : current.filter((v) => v !== value)) as never);
  };

  const goTo = (next: Step) => {
    navigatedRef.current = true;
    setSubmitError(null);
    setStep(next);
  };

  const validateStep = (current: Step) => {
    // Consent is only asked for on the summary step.
    const result = parseQuoteRequest({ ...values, consent: current === 4 ? values.consent : true });
    const stepErrors = result.success ? {} : errorsForStep(result.fieldErrors, current);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) {
      setFocusErrors((n) => n + 1);
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 4 || !validateStep(step)) return;
    if (returnToSummary) {
      setReturnToSummary(false);
      goTo(4);
    } else {
      goTo((step + 1) as Step);
    }
  };

  const handleEdit = (target: 1 | 2 | 3) => {
    setReturnToSummary(true);
    goTo(target);
  };

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (step !== 4) {
      handleNext();
      return;
    }
    // Guards against double clicks and Enter key repeats.
    if (submittingRef.current || !enabled) return;

    const result = parseQuoteRequest(values);
    if (!result.success) {
      setErrors(result.fieldErrors);
      const target = firstStepWithError(result.fieldErrors) ?? 4;
      if (target !== 4) {
        setReturnToSummary(true);
        goTo(target);
      }
      setFocusErrors((n) => n + 1);
      return;
    }

    if (turnstileSiteKey && !turnstileToken) {
      setSubmitError(SUBMIT_ERRORS.challenge_missing);
      return;
    }

    // Reuse the idempotency key while the payload is unchanged, so retries
    // after a lost response never create a second request.
    const payload = JSON.stringify(values);
    const key =
      lastAttemptRef.current?.payload === payload ? lastAttemptRef.current.key : crypto.randomUUID();
    lastAttemptRef.current = { payload, key };

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: key,
          website: honeypotRef.current?.value ?? "",
          startedAt: startedAtRef.current,
          ...(turnstileToken && { turnstileToken }),
          data: values,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        reference?: string;
        visitorEmail?: NotificationStatus;
        error?: string;
        reason?: string;
        fieldErrors?: FieldErrors;
      } | null;

      if (response.ok && body?.reference) {
        navigatedRef.current = true;
        setDone({ reference: body.reference, visitorEmail: body.visitorEmail ?? "pendiente", values });
        return;
      }

      if (body?.error === "invalid" && body.fieldErrors) {
        setErrors(body.fieldErrors);
        const target = firstStepWithError(body.fieldErrors);
        if (target && target !== 4) {
          setReturnToSummary(true);
          goTo(target);
        }
        setFocusErrors((n) => n + 1);
      }
      if (body?.error === "conflict") lastAttemptRef.current = null;
      if (body?.error === "challenge_failed") {
        // Nothing was saved: start over with a fresh token and a new key.
        lastAttemptRef.current = null;
        turnstileRef.current?.reset();
        setSubmitError(
          body.reason === "unavailable" ? SUBMIT_ERRORS.challenge_unavailable : SUBMIT_ERRORS.challenge_failed
        );
        return;
      }
      setSubmitError(SUBMIT_ERRORS[body?.error ?? ""] ?? SUBMIT_ERRORS.generic);
    } catch {
      setSubmitError(SUBMIT_ERRORS.network);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (done) return <QuoteSuccess done={done} headingRef={headingRef} />;

  const e = errors;
  const isRedesign = values.service === "rediseno";
  const today = todayInPuertoRico(new Date());

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate aria-labelledby="quote-step-title">
      {!enabled && (
        <div role="note" className="mb-8 rounded-xl border border-brand-600/40 bg-brand-600/10 p-4 text-sm text-foreground/90">
          El envío de solicitudes todavía no está disponible. Puedes revisar el formulario, pero no se
          podrá enviar hasta que el servicio esté configurado.
        </div>
      )}

      <Progress step={step} />

      <h2
        id="quote-step-title"
        ref={headingRef}
        tabIndex={-1}
        className="mt-8 text-2xl font-semibold tracking-tight focus:outline-none"
      >
        {STEP_TITLES[step]}
      </h2>
      <p className="mt-2 text-sm text-muted">
        Los campos marcados con <span className="text-brand-400">*</span> son obligatorios.
      </p>

      {/* Honeypot: hidden from people and assistive tech; bots tend to fill it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">No completes este campo</label>
        <input ref={honeypotRef} id="website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <div className="mt-8 flex flex-col gap-7">
        {step === 1 && (
          <>
            <div className="grid gap-7 sm:grid-cols-2">
              <TextField
                id="contactName"
                label="Nombre de la persona de contacto"
                required
                autoComplete="name"
                maxLength={LIMITS.contactName}
                value={values.contactName}
                onChange={(ev) => update("contactName", ev.target.value)}
                error={e.contactName}
              />
              <TextField
                id="businessName"
                label="Nombre del negocio u organización"
                required
                autoComplete="organization"
                maxLength={LIMITS.businessName}
                value={values.businessName}
                onChange={(ev) => update("businessName", ev.target.value)}
                error={e.businessName}
              />
              <TextField
                id="email"
                label="Email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                maxLength={LIMITS.email}
                value={values.email}
                onChange={(ev) => update("email", ev.target.value)}
                error={e.email}
              />
              <TextField
                id="whatsapp"
                label="WhatsApp"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                placeholder="+1 787 555 0123"
                hint="Incluye el código de país (+1 para Puerto Rico)."
                maxLength={LIMITS.whatsapp}
                value={values.whatsapp}
                onChange={(ev) => update("whatsapp", ev.target.value)}
                error={e.whatsapp}
              />
            </div>
            <ChoiceGroup
              id="businessType"
              legend="Tipo de negocio u organización"
              type="radio"
              required
              options={BUSINESS_TYPES}
              selected={values.businessType ? [values.businessType] : []}
              onChange={(v) => update("businessType", v as QuoteFormValues["businessType"])}
              error={e.businessType}
            />
            {values.businessType === "otro" && (
              <TextField
                id="businessTypeOther"
                label="¿Qué tipo de negocio u organización es?"
                required
                maxLength={LIMITS.businessTypeOther}
                value={values.businessTypeOther}
                onChange={(ev) => update("businessTypeOther", ev.target.value)}
                error={e.businessTypeOther}
              />
            )}
          </>
        )}

        {step === 2 && (
          <>
            <ChoiceGroup
              id="service"
              legend="¿Qué servicio te interesa?"
              type="radio"
              required
              options={SERVICES}
              selected={values.service ? [values.service] : []}
              onChange={(v) => update("service", v as QuoteFormValues["service"])}
              error={e.service}
            />
            <TextAreaField
              id="goal"
              label="Objetivo principal de la página"
              required
              hint="Por ejemplo: que mis clientes conozcan mis servicios y me escriban por WhatsApp."
              maxLength={LIMITS.goal}
              value={values.goal}
              onChange={(ev) => update("goal", ev.target.value)}
              error={e.goal}
            />
            <TextField
              id="currentUrl"
              label={isRedesign ? "Dirección de tu página actual" : "¿Ya tienes una página web? Escribe su dirección"}
              required={isRedesign}
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="minegocio.com"
              maxLength={LIMITS.currentUrl}
              value={values.currentUrl}
              onChange={(ev) => update("currentUrl", ev.target.value)}
              error={e.currentUrl}
            />
            {isRedesign && (
              <TextAreaField
                id="redesignImprovements"
                label="¿Qué quieres mejorar de tu página actual?"
                required
                hint="Por ejemplo: se ve anticuada, no se lee bien en el celular o la información está desactualizada."
                maxLength={LIMITS.redesignImprovements}
                value={values.redesignImprovements}
                onChange={(ev) => update("redesignImprovements", ev.target.value)}
                error={e.redesignImprovements}
              />
            )}
          </>
        )}

        {step === 3 && (
          <>
            <ChoiceGroup
              id="sections"
              legend="¿Qué secciones te gustaría tener?"
              type="checkbox"
              columns={3}
              hint="Marca todas las que apliquen. Si no estás seguro, puedes dejarlo en blanco."
              options={SECTIONS}
              selected={values.sections}
              onChange={(v, checked) => toggle("sections", v, checked)}
              error={e.sections}
            />
            {values.sections.includes("otra") && (
              <TextField
                id="sectionsOther"
                label="¿Qué otra sección necesitas?"
                required
                maxLength={LIMITS.sectionsOther}
                value={values.sectionsOther}
                onChange={(ev) => update("sectionsOther", ev.target.value)}
                error={e.sectionsOther}
              />
            )}

            <ChoiceGroup
              id="features"
              legend="¿Qué funciones te gustaría tener?"
              type="checkbox"
              hint="Me ayudan a entender lo que necesitas. Se evalúan al preparar la cotización; marcarlas no significa que estén incluidas."
              options={FEATURES}
              selected={values.features}
              onChange={(v, checked) => toggle("features", v, checked)}
              error={e.features}
            />
            {values.features.includes("otra") && (
              <TextField
                id="featuresOther"
                label="¿Qué otra función necesitas?"
                required
                maxLength={LIMITS.featuresOther}
                value={values.featuresOther}
                onChange={(ev) => update("featuresOther", ev.target.value)}
                error={e.featuresOther}
              />
            )}

            {ASSETS.map(({ field, label }) => (
              <ChoiceGroup
                key={field}
                id={field}
                legend={`${label}: ¿lo tienes listo?`}
                type="radio"
                columns={3}
                required
                options={ASSET_STATUSES}
                selected={values[field] ? [values[field]] : []}
                onChange={(v) => update(field, v as QuoteFormValues[typeof field])}
                error={e[field]}
              />
            ))}

            <div className="grid gap-7 sm:grid-cols-2">
              <div className="flex flex-col gap-3">
                <TextField
                  id="budgetUsd"
                  label="Presupuesto aproximado (USD)"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={BUDGET_MAX_USD}
                  step={1}
                  placeholder="Por ejemplo: 800"
                  disabled={values.budgetUndefined}
                  value={values.budgetUndefined ? "" : values.budgetUsd}
                  onChange={(ev) => update("budgetUsd", ev.target.value)}
                  error={e.budgetUsd}
                />
                <CheckboxField
                  id="budgetUndefined"
                  checked={values.budgetUndefined}
                  onChange={(checked) => {
                    update("budgetUndefined", checked);
                    if (checked) update("budgetUsd", "");
                  }}
                >
                  No lo tengo definido
                </CheckboxField>
              </div>
              <div className="flex flex-col gap-3">
                <TextField
                  id="desiredDate"
                  label="Fecha deseada"
                  type="date"
                  min={today}
                  disabled={values.dateUndefined}
                  value={values.dateUndefined ? "" : values.desiredDate}
                  onChange={(ev) => update("desiredDate", ev.target.value)}
                  error={e.desiredDate}
                  className={cn("[color-scheme:dark]")}
                />
                <CheckboxField
                  id="dateUndefined"
                  checked={values.dateUndefined}
                  onChange={(checked) => {
                    update("dateUndefined", checked);
                    if (checked) update("desiredDate", "");
                  }}
                >
                  No tengo una fecha definida
                </CheckboxField>
              </div>
            </div>

            <TextAreaField
              id="comments"
              label="Comentarios adicionales"
              maxLength={LIMITS.comments}
              value={values.comments}
              onChange={(ev) => update("comments", ev.target.value)}
              error={e.comments}
            />
          </>
        )}

        {step === 4 && (
          <>
            <p className="text-sm text-muted">
              Revisa la información antes de enviarla. Puedes editar cualquier sección.
            </p>
            <QuoteSummary values={values} onEdit={handleEdit} />
            <div className="rounded-xl border border-border bg-surface-2 p-5 text-sm leading-relaxed text-foreground/90">
              Enviar esta solicitud <strong>no constituye una cotización ni reserva una fecha</strong>.
              Revisaré la información y me comunicaré contigo para conversar sobre el alcance del proyecto.
            </div>
            <CheckboxField
              id="consent"
              required
              checked={values.consent}
              onChange={(checked) => update("consent", checked)}
              error={e.consent}
            >
              {CONSENT_TEXT}
            </CheckboxField>
            <p className="text-sm text-muted">
              Cómo trato estos datos:{" "}
              <a href="/privacidad" target="_blank" rel="noopener" className="text-brand-300 underline underline-offset-4">
                Política de privacidad
              </a>
              .
            </p>
            {enabled && turnstileSiteKey && (
              <TurnstileWidget ref={turnstileRef} siteKey={turnstileSiteKey} onToken={setTurnstileToken} />
            )}
          </>
        )}
      </div>

      <div role="alert" className="mt-6 empty:hidden">
        {submitError && (
          <p className="rounded-xl border border-brand-600/50 bg-brand-600/10 p-4 text-sm text-foreground">{submitError}</p>
        )}
      </div>
      <p role="status" className="sr-only">
        {submitting ? "Enviando solicitud…" : ""}
      </p>

      <div className="mt-8 flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
        {step > 1 && !returnToSummary ? (
          <Button type="button" variant="secondary" onClick={() => goTo((step - 1) as Step)}>
            <ArrowLeft className="size-4" aria-hidden="true" /> Anterior
          </Button>
        ) : (
          <span />
        )}

        {step < 4 ? (
          <Button type="submit">
            {returnToSummary ? "Guardar y volver al resumen" : "Siguiente"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        ) : (
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <Button
              type="submit"
              size="lg"
              disabled={!enabled}
              aria-disabled={submitting || undefined}
              aria-describedby={!enabled ? "submit-unavailable" : undefined}
              className={cn(submitting && "cursor-wait opacity-80")}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Enviando…
                </>
              ) : (
                <>Enviar solicitud</>
              )}
            </Button>
            {!enabled && (
              <p id="submit-unavailable" className="text-sm text-muted-2">
                El envío no está disponible todavía.
              </p>
            )}
          </div>
        )}
      </div>
    </form>
  );
}

function Progress({ step }: { step: Step }) {
  return (
    <div>
      <p className="text-sm font-medium text-muted">
        Paso {step} de 4
      </p>
      <ol className="mt-3 grid grid-cols-4 gap-2" aria-label="Progreso de la solicitud">
        {([1, 2, 3, 4] as const).map((n) => {
          const state = n < step ? "done" : n === step ? "current" : "todo";
          return (
            <li key={n} aria-current={state === "current" ? "step" : undefined} className="flex flex-col gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  "h-1.5 rounded-full transition-colors",
                  state === "todo" ? "bg-white/10" : "bg-brand-600"
                )}
              />
              <span className={cn("text-xs", state === "current" ? "font-semibold text-foreground" : "text-muted-2", "hidden sm:block")}>
                {STEP_TITLES[n]}
              </span>
              <span className="sr-only">
                {`${STEP_TITLES[n]}${state === "done" ? " (completado)" : state === "current" ? " (paso actual)" : ""}`}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function QuoteSuccess({ done, headingRef }: { done: Done; headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  const emailMessage =
    done.visitorEmail === "enviado"
      ? `Te envié un email de confirmación a ${done.values.email.trim()}.`
      : done.visitorEmail === "fallido"
        ? "Tu solicitud quedó guardada, pero no pude enviar el email de confirmación. No necesitas enviarla de nuevo; guarda tu referencia."
        : "Tu solicitud quedó guardada. No se envió un email de confirmación, así que te recomiendo guardar tu referencia.";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-600/15 text-brand-400">
          <CheckCircle2 className="size-6" aria-hidden="true" />
        </span>
        <div>
          <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight focus:outline-none">
            Solicitud recibida
          </h2>
          <p className="mt-2 text-sm text-muted">{emailMessage}</p>
        </div>
      </div>

      <div className="rounded-xl border border-brand-600/50 bg-brand-600/10 p-5">
        <p className="text-sm text-muted">Tu referencia</p>
        <p className="mt-1 font-mono text-2xl font-bold tracking-wider">{done.reference}</p>
      </div>

      <p className="rounded-xl border border-border bg-surface-2 p-5 text-sm leading-relaxed text-foreground/90">
        Esta solicitud no constituye una cotización ni reserva una fecha. Revisaré la información y me
        comunicaré contigo para conversar sobre el alcance del proyecto.
      </p>

      <div>
        <h3 className="mb-3 text-lg font-semibold">Lo que enviaste</h3>
        <QuoteSummary values={done.values} />
      </div>

      <div>
        <Button asChild variant="secondary">
          <Link href="/">Volver al inicio</Link>
        </Button>
      </div>
    </div>
  );
}
