// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { QuoteForm } from "@/components/quote/quote-form";

const next = () => screen.getByRole("button", { name: /Siguiente|Guardar y volver al resumen/ });
const submitButton = () => screen.getByRole("button", { name: /Enviar solicitud|Enviando/ });

async function fillStep1(user: UserEvent) {
  await user.type(screen.getByLabelText(/Nombre de la persona de contacto/), "Ana Prueba");
  await user.type(screen.getByLabelText(/Nombre del negocio u organización/), "Panadería de Prueba");
  await user.type(screen.getByLabelText(/^Email/), "ana@example.com");
  await user.click(screen.getByLabelText("Pequeño negocio"));
  await user.click(next());
}

async function fillStep2(user: UserEvent) {
  await user.click(screen.getByLabelText(/^Página informativa/));
  await user.type(screen.getByLabelText(/Objetivo principal/), "Que me escriban por WhatsApp.");
  await user.click(next());
}

async function fillStep3(user: UserEvent) {
  for (const name of [/^Logo/, /^Textos/, /^Fotografías/]) {
    await user.click(within(screen.getByRole("group", { name })).getByLabelText("Lo tengo"));
  }
  await user.click(next());
}

async function reachSummary(user: UserEvent) {
  await fillStep1(user);
  await fillStep2(user);
  await fillStep3(user);
  await user.click(screen.getByLabelText(/Autorizo a RedCode/));
}

function mockFetch(...responses: (Response | Error | Promise<Response>)[]) {
  const fn = vi.fn(async () => {
    const next = responses.length > 1 ? responses.shift()! : responses[0];
    if (next instanceof Error) throw next;
    return next;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const ok = (visitorEmail = "enviado") =>
  Response.json({ reference: "RC-7K2M-9QXD", createdAt: "2026-10-14T16:00:00Z", visitorEmail }, { status: 201 });

const sentKeys = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.map((call) => JSON.parse((call as unknown as [string, RequestInit])[1].body as string).idempotencyKey);

describe("QuoteForm", () => {
  let user: UserEvent;
  beforeEach(() => {
    user = userEvent.setup();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows progress and keeps data when moving back and forth", async () => {
    render(<QuoteForm enabled />);
    expect(screen.getByText("Paso 1 de 4")).toBeTruthy();
    await fillStep1(user);
    expect(screen.getByText("Paso 2 de 4")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Tu proyecto" })).toBe(document.activeElement);

    await user.type(screen.getByLabelText(/Objetivo principal/), "Mi objetivo");
    await user.click(screen.getByRole("button", { name: /Anterior/ }));
    expect((screen.getByLabelText(/Nombre de la persona de contacto/) as HTMLInputElement).value).toBe("Ana Prueba");
    expect((screen.getByLabelText("Pequeño negocio") as HTMLInputElement).checked).toBe(true);
    await user.click(next());
    expect((screen.getByLabelText(/Objetivo principal/) as HTMLTextAreaElement).value).toBe("Mi objetivo");
  });

  it("shows errors next to each field and focuses the first invalid one", async () => {
    render(<QuoteForm enabled />);
    await user.click(next());
    const name = screen.getByLabelText(/Nombre de la persona de contacto/);
    expect(name.getAttribute("aria-invalid")).toBe("true");
    const errorId = name.getAttribute("aria-describedby")!;
    expect(document.getElementById(errorId)?.textContent).toMatch(/Escribe el nombre/);
    expect(document.activeElement).toBe(name);
    expect(screen.getByText("Paso 1 de 4")).toBeTruthy();
    expect(screen.queryByText(/WhatsApp/)?.closest("[aria-invalid=true]")).toBeFalsy();

    await user.type(name, "A");
    expect(name.getAttribute("aria-invalid")).toBeNull();
  });

  it("asks for a description when 'Otro' is selected", async () => {
    render(<QuoteForm enabled />);
    expect(screen.queryByLabelText(/Qué tipo de negocio u organización es/)).toBeNull();
    await user.click(screen.getByLabelText("Otro"));
    expect(screen.getByLabelText(/Qué tipo de negocio u organización es/)).toBeTruthy();
  });

  it("requests the current URL and improvements only for a redesign", async () => {
    render(<QuoteForm enabled />);
    await fillStep1(user);
    expect(screen.getByLabelText(/Ya tienes una página web/)).toBeTruthy();
    expect(screen.queryByLabelText(/Qué quieres mejorar/)).toBeNull();

    await user.click(screen.getByLabelText(/^Rediseño/));
    expect(screen.getByLabelText(/Dirección de tu página actual/)).toBeTruthy();
    await user.type(screen.getByLabelText(/Objetivo principal/), "Renovar");
    await user.click(next());
    expect(screen.getByText("Escribe la dirección de la página que quieres rediseñar.")).toBeTruthy();
    expect(screen.getByText("Cuéntanos qué quieres mejorar de tu página actual.")).toBeTruthy();
  });

  it("disables budget and date inputs when marked as undefined", async () => {
    render(<QuoteForm enabled />);
    await fillStep1(user);
    await fillStep2(user);
    const budget = screen.getByLabelText(/Presupuesto aproximado/) as HTMLInputElement;
    await user.type(budget, "800");
    await user.click(screen.getByLabelText("No lo tengo definido"));
    expect(budget.disabled).toBe(true);
    expect(budget.value).toBe("");
    await user.click(screen.getByLabelText("No tengo una fecha definida"));
    expect((screen.getByLabelText(/Fecha deseada/) as HTMLInputElement).disabled).toBe(true);
  });

  it("shows an editable summary with the disclaimer and consent", async () => {
    render(<QuoteForm enabled />);
    await reachSummary(user);
    expect(screen.getByText("Panadería de Prueba")).toBeTruthy();
    expect(screen.getByText(/no constituye una cotización ni reserva una fecha/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Editar tu negocio/ }));
    const business = screen.getByLabelText(/Nombre del negocio u organización/);
    await user.clear(business);
    await user.type(business, "Panadería Nueva");
    await user.click(next());
    expect(screen.getByText("Paso 4 de 4")).toBeTruthy();
    expect(screen.getByText("Panadería Nueva")).toBeTruthy();
  });

  it("requires consent before submitting", async () => {
    const fetchMock = mockFetch(ok());
    render(<QuoteForm enabled />);
    await reachSummary(user);
    await user.click(screen.getByLabelText(/Autorizo a RedCode/)); // uncheck
    await user.click(submitButton());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Necesitamos tu autorización/)).toBeTruthy();
  });

  it("sends only once on a double click and shows the reference", async () => {
    let resolve!: (r: Response) => void;
    const fetchMock = mockFetch(new Promise<Response>((r) => (resolve = r)));
    render(<QuoteForm enabled />);
    await reachSummary(user);

    await user.dblClick(submitButton());
    await user.click(submitButton());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toMatch(/Enviando/);

    resolve(ok());
    expect(await screen.findByRole("heading", { name: "Solicitud recibida" })).toBeTruthy();
    expect(screen.getByText("RC-7K2M-9QXD")).toBeTruthy();
    expect(screen.getByText(/Te envié un email de confirmación a ana@example.com/)).toBeTruthy();
    expect(screen.getByText("Panadería de Prueba")).toBeTruthy();
  });

  it("does not announce a confirmation email that was not sent", async () => {
    mockFetch(ok("fallido"));
    render(<QuoteForm enabled />);
    await reachSummary(user);
    await user.click(submitButton());
    expect(await screen.findByText(/no pude enviar el email de confirmación. No necesitas enviarla de nuevo/)).toBeTruthy();
    expect(screen.queryByText(/Te envié un email/)).toBeNull();
  });

  it("keeps the data after a server failure and retries with the same idempotency key", async () => {
    const fetchMock = mockFetch(Response.json({ error: "persist_failed" }, { status: 503 }), ok());
    render(<QuoteForm enabled />);
    await reachSummary(user);
    await user.click(submitButton());
    expect(await screen.findByText(/No pude guardar tu solicitud/)).toBeTruthy();
    expect(screen.getByText("Panadería de Prueba")).toBeTruthy();

    await user.click(submitButton());
    expect(await screen.findByText("RC-7K2M-9QXD")).toBeTruthy();
    const keys = sentKeys(fetchMock);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it("uses a new idempotency key if the data changed after a failure", async () => {
    const fetchMock = mockFetch(new TypeError("Failed to fetch"), ok());
    render(<QuoteForm enabled />);
    await reachSummary(user);
    await user.click(submitButton());
    expect(await screen.findByText(/problema de conexión/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Editar tu negocio/ }));
    await user.type(screen.getByLabelText(/Nombre del negocio u organización/), " 2");
    await user.click(next());
    await user.click(submitButton());
    await screen.findByText("RC-7K2M-9QXD");
    const keys = sentKeys(fetchMock);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("maps server field errors back to their step", async () => {
    mockFetch(Response.json({ error: "invalid", fieldErrors: { email: "Escribe un email válido." } }, { status: 422 }));
    render(<QuoteForm enabled />);
    await reachSummary(user);
    await user.click(submitButton());
    expect(await screen.findByText("Escribe un email válido.")).toBeTruthy();
    expect(screen.getByText("Paso 1 de 4")).toBeTruthy();
  });

  it("explains that sending is unavailable when not configured", async () => {
    const fetchMock = mockFetch(ok());
    render(<QuoteForm enabled={false} />);
    expect(screen.getByRole("note").textContent).toMatch(/todavía no está disponible/);
    await reachSummary(user);
    expect((submitButton() as HTMLButtonElement).disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never writes form data to browser storage", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    mockFetch(ok());
    render(<QuoteForm enabled />);
    await reachSummary(user);
    await user.click(submitButton());
    await screen.findByText("RC-7K2M-9QXD");
    expect(setItem).not.toHaveBeenCalled();
  });

  it("sends the honeypot and start time with the request", async () => {
    const fetchMock = mockFetch(ok());
    render(<QuoteForm enabled />);
    await reachSummary(user);
    await user.click(submitButton());
    await screen.findByText("RC-7K2M-9QXD");
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.website).toBe("");
    expect(body.startedAt).toBeGreaterThan(0);
    expect(body.data.consent).toBe(true);
  });
});
