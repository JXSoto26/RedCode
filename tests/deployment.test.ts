import { describe, expect, it } from "vitest";
import { DEV_PROJECT_REF, assertDeploymentConfig, deploymentEnv, deploymentProblems } from "@/lib/deployment";

const PROD = "ylzygfcvycbwmcyzmefy";
const OTHER = "lpyxwtmtfdeyvnrqybsi";
const url = (ref: string) => `https://${ref}.supabase.co`;

describe("deployment environment guard", () => {
  it("detects the environment from VERCEL_ENV", () => {
    expect(deploymentEnv({ VERCEL_ENV: "production" })).toBe("production");
    expect(deploymentEnv({ VERCEL_ENV: "preview" })).toBe("preview");
    expect(deploymentEnv({})).toBe("local");
  });

  it("accepts every environment without Supabase (form disabled)", () => {
    for (const VERCEL_ENV of ["production", "preview", undefined]) {
      expect(deploymentProblems({ VERCEL_ENV })).toEqual([]);
    }
  });

  describe("production", () => {
    it("accepts only its own PROD project", () => {
      expect(deploymentProblems({ VERCEL_ENV: "production", SUPABASE_URL: url(PROD), SUPABASE_PROD_PROJECT_REF: PROD })).toEqual([]);
    });

    it("never accepts DEV", () => {
      const p = deploymentProblems({ VERCEL_ENV: "production", SUPABASE_URL: url(DEV_PROJECT_REF), SUPABASE_PROD_PROJECT_REF: DEV_PROJECT_REF });
      expect(p).toContain("Production apunta al proyecto DEV de Supabase.");
      expect(p).toContain("SUPABASE_PROD_PROJECT_REF es el proyecto DEV.");
      expect(() => assertDeploymentConfig({ VERCEL_ENV: "production", SUPABASE_URL: url(DEV_PROJECT_REF) })).toThrow(
        /Configuración de entorno incorrecta \(production\)/
      );
    });

    it("requires SUPABASE_PROD_PROJECT_REF and a matching URL", () => {
      expect(deploymentProblems({ VERCEL_ENV: "production", SUPABASE_URL: url(PROD) })).toEqual([
        "Production con Supabase necesita SUPABASE_PROD_PROJECT_REF.",
      ]);
      expect(deploymentProblems({ VERCEL_ENV: "production", SUPABASE_URL: url(OTHER), SUPABASE_PROD_PROJECT_REF: PROD })).toEqual([
        `SUPABASE_URL (${OTHER}) no coincide con SUPABASE_PROD_PROJECT_REF (${PROD}).`,
      ]);
    });

    it("rejects Cloudflare test keys", () => {
      const p = deploymentProblems({
        VERCEL_ENV: "production",
        TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
        TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
      });
      expect(p).toHaveLength(2);
      expect(p[0]).toMatch(/clave de prueba/);
    });

    it("checks the shape of the email settings it cannot read back", () => {
      const ok = {
        VERCEL_ENV: "production",
        QUOTE_EMAIL_FROM: "RedCode Web Design Studio <cotizaciones@redcodewebdesign.com>",
        QUOTE_EMAIL_REPLY_TO: "redcodepr@gmail.com",
        QUOTE_NOTIFY_EMAIL: "redcodepr@gmail.com",
        QUOTE_EMAIL_DELIVERY: "allowlist",
        QUOTE_EMAIL_ALLOWLIST: "redcodepr@gmail.com",
      };
      expect(deploymentProblems(ok)).toEqual([]);
      expect(deploymentProblems({ ...ok, QUOTE_EMAIL_FROM: "cotizaciones@redcodewebdesign.com" })).toEqual([]);

      const bad = deploymentProblems({
        ...ok,
        QUOTE_EMAIL_FROM: "RedCode <onboarding@resend.dev>",
        QUOTE_EMAIL_REPLY_TO: "a@x.com, b@x.com",
        QUOTE_NOTIFY_EMAIL: "no-es-un-email",
        QUOTE_EMAIL_ALLOWLIST: "redcodepr@gmail.com,???",
      });
      expect(bad).toEqual([
        "QUOTE_EMAIL_FROM debe ser una dirección de redcodewebdesign.com (dominio verificado en Resend).",
        "QUOTE_EMAIL_REPLY_TO debe ser una sola dirección de email.",
        "QUOTE_NOTIFY_EMAIL debe ser una sola dirección de email.",
        "QUOTE_EMAIL_ALLOWLIST debe ser una lista de emails separada por comas.",
      ]);
      expect(bad.join(" ")).not.toMatch(/onboarding|no-es-un-email|\?\?\?/);
    });
  });

  describe("preview and local", () => {
    it("accept only DEV", () => {
      expect(deploymentProblems({ VERCEL_ENV: "preview", SUPABASE_URL: url(DEV_PROJECT_REF) })).toEqual([]);
      expect(deploymentProblems({ SUPABASE_URL: url(DEV_PROJECT_REF) })).toEqual([]);
      expect(deploymentProblems({ VERCEL_ENV: "preview", SUPABASE_URL: url(PROD) })[0]).toMatch(/solo puede usar Supabase DEV/);
      expect(deploymentProblems({ SUPABASE_URL: url(PROD) })[0]).toMatch(/local solo puede usar Supabase DEV/);
    });

    it("Preview keeps email restricted to the allowlist", () => {
      expect(deploymentProblems({ VERCEL_ENV: "preview", QUOTE_EMAIL_DELIVERY: "all" })).toEqual([
        "Preview no puede usar QUOTE_EMAIL_DELIVERY=all: debe quedarse en 'allowlist'.",
      ]);
    });
  });

  it("never puts secret values in its messages", () => {
    const problems = deploymentProblems({
      VERCEL_ENV: "production",
      SUPABASE_URL: url(DEV_PROJECT_REF),
      TURNSTILE_SECRET_KEY: "2x0000000000000000000000000000000AA",
      SUPABASE_SECRET_KEY: "fake-secret-value-for-test",
    });
    expect(problems.join(" ")).not.toMatch(/2x0000|fake-secret-value/);
  });
});
