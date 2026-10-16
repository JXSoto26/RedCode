/**
 * Runs once when each server instance starts (Next.js instrumentation).
 * Refuses to serve with a wrong environment/project combination, e.g. a
 * Production deployment pointing at Supabase DEV. See lib/deployment.ts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertDeploymentConfig } = await import("./lib/deployment");
    assertDeploymentConfig();
  }
}
