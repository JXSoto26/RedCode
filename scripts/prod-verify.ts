/**
 * Read-only checks of Supabase PROD after migrating:
 *
 *   npm run prod:verify
 *
 * Uses only the PUBLIC (publishable) key from .env.prod.local: it creates no
 * users, rows, files or emails. The full DEV suites never run against PROD.
 */
import { DEV_PROJECT_REF } from "../lib/deployment";

const url = process.env.SUPABASE_URL?.trim() ?? "";
const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
const prodRef = process.env.SUPABASE_PROD_PROJECT_REF?.trim() ?? "";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures++;
};

async function main() {
  if (process.env.REDCODE_ENV_FILE !== "prod") {
    throw new Error("No se cargó .env.prod.local. Usa npm run prod:verify (carga --env-file=.env.prod.local).");
  }
  if (!url || !key || !prodRef) throw new Error("Faltan SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY o SUPABASE_PROD_PROJECT_REF en .env.prod.local.");
  const host = new URL(url).hostname;
  if (host !== `${prodRef}.supabase.co`) throw new Error("SUPABASE_URL no es el proyecto SUPABASE_PROD_PROJECT_REF.");
  if (prodRef === DEV_PROJECT_REF) throw new Error("SUPABASE_PROD_PROJECT_REF es el proyecto DEV.");
  console.log(`Destino: ${prodRef} (solo lectura, clave pública)`);

  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  for (const table of [
    "quote_requests",
    "quote_rate_limits",
    "admin_users",
    "quote_notes",
    "quote_status_history",
    "quote_drafts",
    "quote_draft_items",
    "quotes",
    "quote_items",
    "quote_sends",
  ]) {
    const r = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, { headers });
    const body = (await r.json().catch(() => null)) as { code?: string } | null;
    check(`anónimo no puede leer ${table}`, body?.code === "42501", `${r.status} ${body?.code ?? ""}`);
  }

  // Called with their real argument names, so the answer reflects permissions
  // (42501) rather than "function not found". Random ids and an invalid rate
  // window: even a misconfigured grant could not write anything.
  const id = () => crypto.randomUUID();
  const calls: [string, Record<string, unknown>][] = [
    ["admin_set_quote_status", { p_request_id: id(), p_expected_status: "nueva", p_new_status: "cerrada" }],
    ["admin_add_quote_note", { p_request_id: id(), p_body: "x" }],
    ["admin_save_quote_draft", { p_request_id: id(), p_expected_version: null, p_draft: {}, p_items: [] }],
    ["admin_finalize_quote", { p_request_id: id(), p_expected_version: 1 }],
    ["admin_attach_quote_pdf", { p_quote_id: id(), p_path: "x/y.pdf", p_sha256: "a".repeat(64), p_size: 1 }],
    [
      "admin_begin_quote_send",
      { p_quote_id: id(), p_request_key: id(), p_kind: "envio", p_subject: "s", p_body: "b", p_sender: "x <x@example.com>", p_reply_to: null },
    ],
    ["admin_claim_quote_send", { p_send_id: id(), p_mode: "nuevo" }],
    ["admin_finish_quote_send", { p_send_id: id(), p_outcome: "aceptado", p_provider_id: "x", p_error: null }],
    ["admin_resolve_quote_send", { p_send_id: id(), p_resolution: "no_enviado", p_provider_id: null }],
    ["admin_set_relationship", { p_request_id: id(), p_expected: "prospecto", p_new: "cliente_activo" }],
    ["admin_set_retention_hold", { p_request_id: id(), p_hold: false, p_reason: null }],
    ["quote_rate_limit_hit", { p_bucket: "verify", p_window_seconds: 0, p_limit: 1 }],
  ];
  for (const [fn, args] of calls) {
    const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const body = (await r.json().catch(() => null)) as { code?: string } | null;
    check(`anónimo no puede ejecutar ${fn}`, body?.code === "42501", `${r.status} ${body?.code ?? ""}`);
  }

  const pub = await fetch(`${url}/storage/v1/object/public/quote-pdfs/x.pdf`);
  check("el bucket quote-pdfs no es público", !pub.ok, String(pub.status));

  const settings = (await (await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })).json()) as { disable_signup?: boolean };
  check("registro público desactivado", settings.disable_signup === true);

  if (failures) {
    console.log(`${failures} comprobación(es) fallaron.`);
    process.exit(1);
  }
  console.log("Todas las comprobaciones pasaron.");
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  process.exit(1);
});
