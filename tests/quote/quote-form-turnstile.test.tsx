// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";

// Cloudflare's script does not run in jsdom: a stand-in lets the test issue
// tokens and observe resets, exactly through the widget's props and handle.
const widget = vi.hoisted(() => ({ resets: 0 }));
vi.mock("@/components/quote/turnstile-widget", async () => {
  const React = await import("react");
  return {
    TurnstileWidget: React.forwardRef<{ reset(): void }, { siteKey: string; onToken: (t: string | null) => void }>(
      function FakeTurnstile({ siteKey, onToken }, ref) {
        const n = React.useRef(0);
        React.useImperativeHandle(ref, () => ({
          reset() {
            widget.resets++;
            onToken(null);
          },
        }));
        return (
          <button type="button" data-sitekey={siteKey} onClick={() => onToken(`tok-${++n.current}`)}>
            Simular verificación
          </button>
        );
      }
    ),
  };
});

import { QuoteForm } from "@/components/quote/quote-form";

const next = () => screen.getByRole("button", { name: /Siguiente|Guardar y volver al resumen/ });
const submitButton = () => screen.getByRole("button", { name: /Enviar solicitud|Enviando/ });

async function reachSummary(user: UserEvent) {
  await user.type(screen.getByLabelText(/Nombre de la persona de contacto/), "Ana Prueba");
  await user.type(screen.getByLabelText(/Nombre del negocio u organización/), "Panadería de Prueba");
  await user.type(screen.getByLabelText(/^Email/), "ana@example.com");
  await user.click(screen.getByLabelText("Pequeño negocio"));
  await user.click(next());
  await user.click(screen.getByLabelText(/^Página informativa/));
  await user.type(screen.getByLabelText(/Objetivo principal/), "Que me escriban por WhatsApp.");
  await user.click(next());
  for (const name of [/^Logo/, /^Textos/, /^Fotografías/]) {
    await user.click(within(screen.getByRole("group", { name })).getByLabelText("Lo tengo"));
  }
  await user.click(next());
  await user.click(screen.getByLabelText(/Autorizo a RedCode/));
}

function mockFetch(...responses: Response[]) {
  const fn = vi.fn(async () => (responses.length > 1 ? responses.shift()! : responses[0]));
  vi.stubGlobal("fetch", fn);
  return fn;
}
const bodies = (fn: ReturnType<typeof vi.fn>) =>
  fn.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string));
const ok = () => Response.json({ reference: "RC-7K2M-9QXD", createdAt: "2026-10-16T16:00:00Z", visitorEmail: "enviado" }, { status: 201 });

describe("QuoteForm with Turnstile", () => {
  let user: UserEvent;
  beforeEach(() => {
    user = userEvent.setup();
    widget.resets = 0;
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("links the privacy policy next to the consent", async () => {
    render(<QuoteForm enabled turnstileSiteKey="site-key" />);
    await reachSummary(user);
    expect(screen.getByRole("link", { name: "Política de privacidad" }).getAttribute("href")).toBe("/privacidad");
  });

  it("does not send until the verification is completed", async () => {
    const fetchMock = mockFetch(ok());
    render(<QuoteForm enabled turnstileSiteKey="site-key" />);
    await reachSummary(user);
    await user.click(submitButton());
    expect(screen.getByText("Completa la verificación anti-spam antes de enviar.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the token with the request", async () => {
    const fetchMock = mockFetch(ok());
    render(<QuoteForm enabled turnstileSiteKey="site-key" />);
    await reachSummary(user);
    await user.click(screen.getByRole("button", { name: "Simular verificación" }));
    await user.click(submitButton());
    expect(await screen.findByText("RC-7K2M-9QXD")).toBeTruthy();
    expect(bodies(fetchMock)[0].turnstileToken).toBe("tok-1");
  });

  it("after a failed check: new token, data kept, new idempotency key", async () => {
    const fetchMock = mockFetch(Response.json({ error: "challenge_failed", reason: "expired" }, { status: 403 }), ok());
    render(<QuoteForm enabled turnstileSiteKey="site-key" />);
    await reachSummary(user);
    await user.click(screen.getByRole("button", { name: "Simular verificación" }));
    await user.click(submitButton());

    expect(await screen.findByText(/La verificación anti-spam no es válida o caducó/)).toBeTruthy();
    expect(widget.resets).toBe(1);
    expect(screen.getByText("Panadería de Prueba")).toBeTruthy(); // the summary still has the data

    // The spent token was discarded: sending again needs a fresh one.
    await user.click(submitButton());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Simular verificación" }));
    await user.click(submitButton());
    expect(await screen.findByText("RC-7K2M-9QXD")).toBeTruthy();

    const [first, second] = bodies(fetchMock);
    expect(second.turnstileToken).toBe("tok-2");
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(second.data).toEqual(first.data);
  });

  it("without a site key (Turnstile not configured) it sends as before", async () => {
    const fetchMock = mockFetch(ok());
    render(<QuoteForm enabled />);
    await reachSummary(user);
    expect(screen.queryByRole("button", { name: "Simular verificación" })).toBeNull();
    await user.click(submitButton());
    expect(await screen.findByText("RC-7K2M-9QXD")).toBeTruthy();
    expect(bodies(fetchMock)[0].turnstileToken).toBeUndefined();
  });

  it("does not render the widget when sending is disabled", async () => {
    render(<QuoteForm enabled={false} turnstileSiteKey="site-key" />);
    await reachSummary(user);
    expect(screen.queryByRole("button", { name: "Simular verificación" })).toBeNull();
  });
});

void React;
