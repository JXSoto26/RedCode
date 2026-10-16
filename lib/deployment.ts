/**
 * Which Supabase project each environment may use, checked at build time
 * (next.config.ts) and when every server instance starts (instrumentation.ts).
 * A wrong combination fails loudly instead of silently mixing DEV and PROD data.
 *
 *   production (Vercel) → only the PROD project (SUPABASE_PROD_PROJECT_REF), never DEV
 *   preview (Vercel)    → only the DEV project, email restricted to the allowlist
 *   local / development → only the DEV project
 *
 * Plain module (no "server-only"): next.config.ts imports it. Error messages
 * name variables and project refs only, never secret values.
 */

/** Supabase DEV project (redcode-dev). Project refs are not secrets. */
export const DEV_PROJECT_REF = "namtdzqeachgaldlbpmf";

export type DeploymentEnv = "production" | "preview" | "development" | "local";

type Env = Record<string, string | undefined>;

const value = (env: Env, name: string) => env[name]?.trim() || null;

export function deploymentEnv(env: Env = process.env): DeploymentEnv {
  const v = value(env, "VERCEL_ENV");
  return v === "production" || v === "preview" || v === "development" ? v : "local";
}

/** Cloudflare's official Turnstile test keys (always pass / fail / spent). */
export const isTurnstileTestKey = (key: string) => /^[123]x0{8,}[0-9A-Z]{2}$/.test(key);

function projectRef(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    return host.endsWith(".supabase.co") ? host.slice(0, -".supabase.co".length) : null;
  } catch {
    return null;
  }
}

/** Problems with the current environment; empty when it is valid. */
export function deploymentProblems(env: Env = process.env): string[] {
  const problems: string[] = [];
  const target = deploymentEnv(env);
  const url = value(env, "SUPABASE_URL");
  const ref = url ? projectRef(url) : null;
  const delivery = value(env, "QUOTE_EMAIL_DELIVERY");

  if (url && !ref) problems.push("SUPABASE_URL no es una URL de proyecto de Supabase (https://<ref>.supabase.co).");
  if (delivery && delivery !== "allowlist" && delivery !== "all") {
    problems.push("QUOTE_EMAIL_DELIVERY debe ser 'allowlist' o 'all'.");
  }

  if (target === "production") {
    const prodRef = value(env, "SUPABASE_PROD_PROJECT_REF");
    if (ref === DEV_PROJECT_REF) problems.push("Production apunta al proyecto DEV de Supabase.");
    if (prodRef === DEV_PROJECT_REF) problems.push("SUPABASE_PROD_PROJECT_REF es el proyecto DEV.");
    if (url && !prodRef) problems.push("Production con Supabase necesita SUPABASE_PROD_PROJECT_REF.");
    if (url && prodRef && ref !== prodRef) problems.push(`SUPABASE_URL (${ref}) no coincide con SUPABASE_PROD_PROJECT_REF (${prodRef}).`);
    for (const name of ["TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"]) {
      const key = value(env, name);
      if (key && isTurnstileTestKey(key)) problems.push(`${name} es una clave de prueba de Cloudflare: no se admite en Production.`);
    }
  } else {
    if (ref && ref !== DEV_PROJECT_REF) {
      problems.push(`El entorno ${target} solo puede usar Supabase DEV (${DEV_PROJECT_REF}); SUPABASE_URL apunta a ${ref}.`);
    }
    if (target === "preview" && delivery === "all") {
      problems.push("Preview no puede usar QUOTE_EMAIL_DELIVERY=all: debe quedarse en 'allowlist'.");
    }
  }
  return problems;
}

export function assertDeploymentConfig(env: Env = process.env) {
  const problems = deploymentProblems(env);
  if (problems.length) {
    throw new Error(`Configuración de entorno incorrecta (${deploymentEnv(env)}):\n- ${problems.join("\n- ")}`);
  }
}
