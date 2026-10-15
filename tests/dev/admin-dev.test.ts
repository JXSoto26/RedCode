/**
 * Real checks of the admin panel's data protection through the Supabase API
 * (PostgREST), against DEV. Run with `npm run test:dev`.
 *
 * Creates one temporary, confirmed user through the Auth admin API (no email
 * is sent), with a random password generated in memory, and deletes it at the
 * end. The admin path is covered by supabase/tests/admin_access.sql.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.SUPABASE_URL ?? "";
const devRef = process.env.SUPABASE_DEV_PROJECT_REF ?? "";
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
const secretKey = process.env.SUPABASE_SECRET_KEY ?? "";

const PRIVATE_TABLES = [
  "quote_notes",
  "quote_drafts",
  "quote_draft_items",
  "quote_status_history",
  "admin_users",
  "quotes",
  "quote_items",
  "quote_sends",
];
const RPCS: [string, Record<string, unknown>][] = [
  ["admin_set_quote_status", { p_request_id: randomUUID(), p_expected_status: "nueva", p_new_status: "cerrada" }],
  ["admin_add_quote_note", { p_request_id: randomUUID(), p_body: "x" }],
  ["admin_save_quote_draft", { p_request_id: randomUUID(), p_expected_version: null, p_draft: {}, p_items: [] }],
  ["admin_finalize_quote", { p_request_id: randomUUID(), p_expected_version: 1 }],
  ["admin_attach_quote_pdf", { p_quote_id: randomUUID(), p_path: "x/y.pdf", p_sha256: "a".repeat(64), p_size: 1 }],
  ["admin_begin_quote_send", { p_quote_id: randomUUID(), p_request_key: randomUUID(), p_kind: "envio", p_subject: "s", p_body: "b" }],
  ["admin_claim_quote_send", { p_send_id: randomUUID(), p_mode: "nuevo" }],
  ["admin_finish_quote_send", { p_send_id: randomUUID(), p_outcome: "aceptado", p_provider_id: "x", p_error: null }],
  ["admin_resolve_quote_send", { p_send_id: randomUUID(), p_resolution: "no_enviado", p_provider_id: null }],
];

const options = { auth: { persistSession: false, autoRefreshToken: false } };
let admin: SupabaseClient;
let user: SupabaseClient;
let userId: string | null = null;

beforeAll(async () => {
  if (!url || !devRef || !publishableKey || !secretKey) {
    throw new Error("Faltan SUPABASE_URL, SUPABASE_DEV_PROJECT_REF, SUPABASE_PUBLISHABLE_KEY o SUPABASE_SECRET_KEY en .env.local.");
  }
  if (new URL(url).hostname !== `${devRef}.supabase.co`) {
    throw new Error("SUPABASE_URL no coincide con SUPABASE_DEV_PROJECT_REF. Estas pruebas solo corren contra DEV.");
  }
  admin = createClient(url, secretKey, options);

  const email = `panel-test+${randomUUID()}@example.com`;
  const password = randomBytes(24).toString("base64url");
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;

  user = createClient(url, publishableKey, options);
  const signedIn = await user.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
});

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
});

describe("anonymous (publishable key, no session)", () => {
  const anon = () => createClient(url, publishableKey, options);

  it.each(PRIVATE_TABLES)("cannot read %s", async (table) => {
    const { error } = await anon().from(table).select("*").limit(1);
    expect(error?.code).toBe("42501");
  });

  it.each(RPCS)("cannot call %s", async (fn, args) => {
    const { error } = await anon().rpc(fn, args);
    expect(error?.code).toBe("42501");
  });
});

describe("signed-in user who is not an admin", () => {
  it.each([...PRIVATE_TABLES, "quote_requests"])("sees no rows in %s", async (table) => {
    const { data, error } = await user.from(table).select("*").limit(5);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it.each(RPCS)("is refused by %s", async (fn, args) => {
    const { error } = await user.rpc(fn, args);
    expect(error?.code).toBe("RC403");
  });

  it("cannot write tables directly or make itself admin", async () => {
    const notes = await user.from("quote_notes").insert({ quote_request_id: randomUUID(), body: "x", created_by_email: "x" });
    expect(notes.error?.code).toBe("42501");
    const self = await user.from("admin_users").insert({ user_id: userId });
    expect(self.error?.code).toBe("42501");
    const status = await user.from("quote_requests").update({ status: "cerrada" }).eq("reference", "RC-0000-0000");
    expect(status.error?.code).toBe("42501");
  });

  it("gets valid (empty) results for the exact queries the panel runs", async () => {
    const term = `"*ana x*"`;
    const list = await user
      .from("quote_requests")
      .select("id, reference, business_name, contact_name, service, created_at, status", { count: "exact" })
      .eq("status", "nueva")
      .or(`reference.ilike.${term},business_name.ilike.${term},contact_name.ilike.${term}`)
      .order("created_at", { ascending: false })
      .range(0, 19);
    expect(list.error).toBeNull();
    expect(list.count).toBe(0);

    const draft = await user
      .from("quote_drafts")
      .select("id, version, quote_draft_items(id, position, description, quantity::text, unit_price_cents)")
      .eq("quote_request_id", randomUUID())
      .maybeSingle();
    expect(draft.error).toBeNull();
    expect(draft.data).toBeNull();
  });
});

describe("private PDF storage (bucket quote-pdfs)", () => {
  const tinyPdf = new Blob(["%PDF-1.3 test"], { type: "application/pdf" });

  it("anonymous: cannot list, download or upload", async () => {
    const storage = createClient(url, publishableKey, options).storage.from("quote-pdfs");
    const list = await storage.list("");
    expect(list.data ?? []).toEqual([]);
    expect((await storage.download("any/file.pdf")).data).toBeNull();
    expect((await storage.upload(`intruder/${randomUUID()}.pdf`, tinyPdf)).error).not.toBeNull();
    // No public URL works for a private bucket.
    const pub = await fetch(`${url}/storage/v1/object/public/quote-pdfs/any/file.pdf`);
    expect(pub.ok).toBe(false);
  });

  it("signed in without admin rights: cannot list, download or upload", async () => {
    const storage = user.storage.from("quote-pdfs");
    expect((await storage.list("")).data ?? []).toEqual([]);
    expect((await storage.download("any/file.pdf")).data).toBeNull();
    expect((await storage.upload(`intruder/${randomUUID()}.pdf`, tinyPdf)).error).not.toBeNull();
  });
});

describe("service_role (the public form's server key)", () => {
  it.each(PRIVATE_TABLES)("cannot read %s", async (table) => {
    const { error } = await admin.from(table).select("*").limit(1);
    expect(error?.code).toBe("42501");
  });
});
