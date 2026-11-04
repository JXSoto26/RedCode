import { afterEach, describe, expect, it, vi } from "vitest";

/** When the public form is allowed to accept requests, per environment. */

const privacy = vi.hoisted(() => ({ final: false }));
vi.mock("@/lib/privacy", () => ({ privacyPolicyFinal: () => privacy.final }));

import { getTurnstileConfig, isQuoteSubmissionEnabled, turnstileSiteKey } from "@/lib/quote/config";

const DEV = "namtdzqeachgaldlbpmf";
const PROD = "ylzygfcvycbwmcyzmefy";
const TEST_SITE = "1x00000000000000000000AA";
const TEST_SECRET = "1x0000000000000000000000000000000AA";

function setEnv(vars: Record<string, string>) {
  for (const name of [
    "VERCEL_ENV",
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "QUOTE_RATE_LIMIT_SECRET",
    "SUPABASE_PROD_PROJECT_REF",
    "TURNSTILE_SITE_KEY",
    "TURNSTILE_SECRET_KEY",
    "TURNSTILE_EXPECTED_HOSTNAMES",
    "QUOTE_EMAIL_DELIVERY",
  ]) {
    vi.stubEnv(name, vars[name] ?? "");
  }
}

const base = (ref: string) => ({
  SUPABASE_URL: `https://${ref}.supabase.co`,
  SUPABASE_SECRET_KEY: "fake-secret",
  QUOTE_RATE_LIMIT_SECRET: "r",
});
const prodBase = { ...base(PROD), VERCEL_ENV: "production", SUPABASE_PROD_PROJECT_REF: PROD };
const realKeys = {
  TURNSTILE_SITE_KEY: "0x4AAAAAAAreal-site",
  TURNSTILE_SECRET_KEY: "0x4AAAAAAAreal-secret",
  TURNSTILE_EXPECTED_HOSTNAMES: "redcodewebdesign.com,www.redcodewebdesign.com",
};

afterEach(() => {
  vi.unstubAllEnvs();
  privacy.final = false;
});

describe("quote form availability", () => {
  it("local/preview with DEV and no Turnstile: enabled (Turnstile not enforced)", () => {
    setEnv({ ...base(DEV), VERCEL_ENV: "preview" });
    expect(isQuoteSubmissionEnabled()).toBe(true);
    expect(turnstileSiteKey()).toBeNull();
  });

  it("preview with Cloudflare test keys: enforced, action/hostname checks relaxed", () => {
    setEnv({ ...base(DEV), VERCEL_ENV: "preview", TURNSTILE_SITE_KEY: TEST_SITE, TURNSTILE_SECRET_KEY: TEST_SECRET });
    expect(isQuoteSubmissionEnabled()).toBe(true);
    expect(getTurnstileConfig()).toMatchObject({ status: "enabled", testKeys: true });
  });

  it("only one Turnstile key: disabled", () => {
    setEnv({ ...base(DEV), TURNSTILE_SITE_KEY: TEST_SITE });
    expect(isQuoteSubmissionEnabled()).toBe(false);
  });

  it("preview pointing at a non-DEV project: disabled", () => {
    setEnv({ ...base(PROD), VERCEL_ENV: "preview" });
    expect(isQuoteSubmissionEnabled()).toBe(false);
  });

  describe("production", () => {
    it("without Turnstile: disabled", () => {
      privacy.final = true;
      setEnv(prodBase);
      expect(isQuoteSubmissionEnabled()).toBe(false);
      expect(getTurnstileConfig()).toEqual({ status: "misconfigured", reason: "turnstile_missing" });
    });

    it("with Cloudflare test keys: disabled", () => {
      privacy.final = true;
      setEnv({ ...prodBase, ...realKeys, TURNSTILE_SITE_KEY: TEST_SITE, TURNSTILE_SECRET_KEY: TEST_SECRET });
      expect(isQuoteSubmissionEnabled()).toBe(false);
    });

    it("without expected hostnames: disabled", () => {
      privacy.final = true;
      setEnv({ ...prodBase, ...realKeys, TURNSTILE_EXPECTED_HOSTNAMES: "" });
      expect(isQuoteSubmissionEnabled()).toBe(false);
    });

    it("with everything but a draft privacy policy: disabled (launch pending)", () => {
      setEnv({ ...prodBase, ...realKeys });
      expect(isQuoteSubmissionEnabled()).toBe(false);
    });

    it("with real keys, hostnames, its own project and a final policy: enabled, strict checks", () => {
      privacy.final = true;
      setEnv({ ...prodBase, ...realKeys });
      expect(isQuoteSubmissionEnabled()).toBe(true);
      expect(getTurnstileConfig()).toMatchObject({
        status: "enabled",
        testKeys: false,
        expectedHostnames: ["redcodewebdesign.com", "www.redcodewebdesign.com"],
      });
    });

    it("pointing at DEV: disabled even if everything else is set", () => {
      privacy.final = true;
      setEnv({ ...prodBase, ...base(DEV), ...realKeys });
      expect(isQuoteSubmissionEnabled()).toBe(false);
    });
  });
});
