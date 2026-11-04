import { describe, expect, it, vi } from "vitest";
import { TURNSTILE_ACTION, createTurnstileVerifier } from "@/lib/quote/turnstile";

const KEY = "3f1c2b8e-6a1d-4c2e-9f3b-1a2b3c4d5e6f";
const strict = { expectedHostnames: ["redcodewebdesign.com"], checkAction: true };

const siteverify = (body: Record<string, unknown>, status = 200) =>
  vi.fn<typeof fetch>(async () => Response.json(body, { status }));

describe("Turnstile verification (server)", () => {
  it("sends the secret, token, IP and idempotency key to siteverify", async () => {
    const fetchMock = siteverify({ success: true, action: TURNSTILE_ACTION, hostname: "redcodewebdesign.com" });
    const r = await createTurnstileVerifier("secret", strict, fetchMock).verify("tok", "203.0.113.7", KEY);
    expect(r).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(JSON.parse(init.body as string)).toEqual({
      secret: "secret",
      response: "tok",
      remoteip: "203.0.113.7",
      idempotency_key: KEY,
    });
  });

  it("rejects a missing token without calling Cloudflare", async () => {
    const fetchMock = siteverify({ success: true });
    const v = createTurnstileVerifier("secret", strict, fetchMock);
    expect(await v.verify(undefined, null, KEY)).toEqual({ ok: false, reason: "missing" });
    expect(await v.verify("", null, KEY)).toEqual({ ok: false, reason: "missing" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid and expired/duplicate tokens", async () => {
    expect(
      await createTurnstileVerifier("s", strict, siteverify({ success: false, "error-codes": ["invalid-input-response"] })).verify("t", null, KEY)
    ).toEqual({ ok: false, reason: "invalid" });
    expect(
      await createTurnstileVerifier("s", strict, siteverify({ success: false, "error-codes": ["timeout-or-duplicate"] })).verify("t", null, KEY)
    ).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a token issued for another action or hostname", async () => {
    expect(
      await createTurnstileVerifier("s", strict, siteverify({ success: true, action: "login", hostname: "redcodewebdesign.com" })).verify("t", null, KEY)
    ).toEqual({ ok: false, reason: "mismatch" });
    expect(
      await createTurnstileVerifier("s", strict, siteverify({ success: true, action: TURNSTILE_ACTION, hostname: "evil.example" })).verify("t", null, KEY)
    ).toEqual({ ok: false, reason: "mismatch" });
  });

  it("fails closed when Cloudflare cannot be reached or errors", async () => {
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await createTurnstileVerifier("s", strict, down).verify("t", null, KEY)).toEqual({ ok: false, reason: "unavailable" });
    expect(await createTurnstileVerifier("s", strict, siteverify({}, 500)).verify("t", null, KEY)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(
      await createTurnstileVerifier("s", strict, siteverify({ success: false, "error-codes": ["internal-error"] })).verify("t", null, KEY)
    ).toEqual({ ok: false, reason: "unavailable" });
  });

  it("with Cloudflare test keys (outside Production) skips only action/hostname checks", async () => {
    const lenient = { expectedHostnames: null, checkAction: false };
    expect(await createTurnstileVerifier("s", lenient, siteverify({ success: true, hostname: "example.com" })).verify("t", null, KEY)).toEqual({
      ok: true,
    });
    expect(
      await createTurnstileVerifier("s", lenient, siteverify({ success: false, "error-codes": ["invalid-input-response"] })).verify("t", null, KEY)
    ).toEqual({ ok: false, reason: "invalid" });
  });
});
