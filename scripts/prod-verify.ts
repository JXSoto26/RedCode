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

  for (const fn of ["admin_set_quote_status", "admin_finalize_quote", "admin_begin_quote_send", "quote_rate_limit_hit"]) {
    const r = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: "{}" });
    check(`anónimo no puede ejecutar ${fn}`, !r.ok, String(r.status));
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
