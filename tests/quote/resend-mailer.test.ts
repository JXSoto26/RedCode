import { describe, expect, it, vi } from "vitest";
import { createResendMailer } from "@/lib/quote/resend-mailer";

const message = {
  to: "ana@example.com",
  subject: "Asunto",
  text: "Hola",
  html: "<p>Hola</p>",
  replyTo: "jeremy@example.com",
  idempotencyKey: "quote-123-visitor",
};

describe("createResendMailer", () => {
  it("sends with the API key, an idempotency key and reply_to", async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: "email_1" }));
    const result = await createResendMailer("re_test", "RedCode <a@b.dev>", fetchMock).send(message);
    expect(result).toEqual({ ok: true, id: "email_1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test");
    expect(headers["Idempotency-Key"]).toBe("quote-123-visitor");
    expect(JSON.parse(init.body as string)).toMatchObject({ to: ["ana@example.com"], reply_to: "jeremy@example.com" });
  });

  it("keeps only a short error code, never the provider message", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        { name: "validation_error", message: "You can only send testing emails to your own email address (ana@example.com)." },
        { status: 403 }
      )
    );
    const result = await createResendMailer("re_test", "a@b.dev", fetchMock).send(message);
    expect(result).toEqual({ ok: false, error: "http_403_validation_error" });
  });

  it("reports network failures and timeouts as failures", async () => {
    const network = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await createResendMailer("k", "f", network).send(message)).toEqual({ ok: false, error: "network_error" });
    const timeout = vi.fn(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    expect(await createResendMailer("k", "f", timeout).send(message)).toEqual({ ok: false, error: "timeout" });
  });
});
