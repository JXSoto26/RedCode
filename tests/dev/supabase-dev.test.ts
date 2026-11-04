/**
 * Real checks against the Supabase DEV project. Run with `npm run test:dev`
 * after applying the migration to DEV. Never point this at production:
 * the suite refuses to run unless SUPABASE_URL matches SUPABASE_DEV_PROJECT_REF.
 *
 * It creates rows labeled "Prueba automatizada" in DEV (the server role cannot
 * delete; remove them from the dashboard if you want). No emails are sent.
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { submitQuoteRequest } from "@/lib/quote/service";
import { createSupabaseAdminClient, createSupabaseQuoteRepository } from "@/lib/quote/supabase-repository";
import { validValues } from "../quote/fixtures";

const url = process.env.SUPABASE_URL ?? "";
const devRef = process.env.SUPABASE_DEV_PROJECT_REF ?? "";
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
const secretKey = process.env.SUPABASE_SECRET_KEY ?? "";

beforeAll(() => {
  if (!url || !devRef || !publishableKey || !secretKey) {
    throw new Error("Faltan SUPABASE_URL, SUPABASE_DEV_PROJECT_REF, SUPABASE_PUBLISHABLE_KEY o SUPABASE_SECRET_KEY en .env.local.");
  }
  if (new URL(url).hostname !== `${devRef}.supabase.co`) {
    throw new Error("SUPABASE_URL no coincide con SUPABASE_DEV_PROJECT_REF. Estas pruebas solo corren contra DEV.");
  }
});

const anon = () => createClient(url, publishableKey, { auth: { persistSession: false } });

describe("public (publishable key) access is denied", () => {
  it("cannot read quote requests", async () => {
    const { data, error } = await anon().from("quote_requests").select("id, reference, email").limit(1);
    // Revoked privileges surface as an error; either way nothing is returned.
    expect(error !== null || (data ?? []).length === 0).toBe(true);
    expect(error?.code).toBe("42501");
  });

  it("cannot insert quote requests", async () => {
    const { error } = await anon().from("quote_requests").insert({ reference: "RC-0000-0000" });
    expect(error?.code).toBe("42501");
  });

  it("cannot update quote requests by reference", async () => {
    const { error } = await anon().from("quote_requests").update({ status: "aceptada" }).eq("reference", "RC-0000-0000");
    expect(error?.code).toBe("42501");
  });

  it("cannot read rate-limit buckets or call the rate-limit function", async () => {
    const read = await anon().from("quote_rate_limits").select("*").limit(1);
    expect(read.error?.code).toBe("42501");
    const rpc = await anon().rpc("quote_rate_limit_hit", { p_bucket: "x", p_window_seconds: 60, p_limit: 1 });
    expect(rpc.error).not.toBeNull();
  });
});

describe("server flow against DEV", () => {
  it("saves once per idempotency key and records email as omitted", async () => {
    const repo = createSupabaseQuoteRepository(createSupabaseAdminClient(url, secretKey));
    const deps = { repo, bucketSecret: randomUUID(), email: null };
    const envelope = {
      idempotencyKey: randomUUID(),
      website: "",
      startedAt: Date.now() - 60_000,
      data: validValues({
        businessName: "Prueba automatizada",
        email: `prueba+${Date.now()}@example.com`,
        comments: "[PRUEBA AUTOMÁTICA DEV]",
      }),
    };
    const ctx = { ip: `dev-test-${randomUUID()}`, now: new Date() };

    const [a, b] = await Promise.all([submitQuoteRequest(envelope, ctx, deps), submitQuoteRequest(envelope, ctx, deps)]);
    expect([a.status, b.status].sort()).toEqual(["created", "replayed"]);
    if (!("reference" in a) || !("reference" in b)) throw new Error("expected references");
    expect(a.reference).toBe(b.reference);

    const admin = createSupabaseAdminClient(url, secretKey);
    const { data } = await admin
      .from("quote_requests")
      .select("status, visitor_email_status, owner_email_status, consent_version")
      .eq("reference", a.reference)
      .single();
    expect(data).toMatchObject({ status: "nueva", visitor_email_status: "omitido", owner_email_status: "omitido" });
  });
});
