/**
 * Retries quote notifications that are "pendiente" or "fallido".
 *
 *   npm run quote:retry-emails                 # pending/failed only
 *   npm run quote:retry-emails -- --include-omitted   # also "omitido" (e.g. after configuring email)
 *
 * Safe to run repeatedly: each email uses a provider idempotency key, and
 * requests themselves are never created or modified beyond notification fields.
 * Output lists references only — no personal data.
 */
import { DEV_PROJECT_REF } from "@/lib/deployment";
import { getEmailSettings } from "@/lib/quote/config";
import type { NotificationStatus } from "@/lib/quote/options";
import { sendNotifications } from "@/lib/quote/service";
import {
  createSupabaseAdminClient,
  createSupabaseQuoteRepository,
  fromRow,
} from "@/lib/quote/supabase-repository";
import type { NotificationKind } from "@/lib/quote/types";

const MAX_ATTEMPTS = 5;
const MIN_AGE_MS = 2 * 60 * 1000; // leave in-flight submissions alone

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY.");

  // DEV by default. PROD only when the ref is SUPABASE_PROD_PROJECT_REF and is
  // repeated with --confirm-prod=<ref> (npm run quote:retry-emails:prod).
  const ref = new URL(url).hostname.replace(/\.supabase\.co$/, "");
  if (ref !== DEV_PROJECT_REF) {
    const prodRef = process.env.SUPABASE_PROD_PROJECT_REF?.trim();
    const confirm = process.argv.find((a) => a.startsWith("--confirm-prod="))?.split("=")[1];
    if (process.env.REDCODE_ENV_FILE !== "prod") {
      throw new Error("Destino no-DEV sin .env.prod.local: usa npm run quote:retry-emails:prod.");
    }
    if (!prodRef || ref !== prodRef || confirm !== prodRef) {
      throw new Error(`Destino ${ref} no autorizado: para PROD usa SUPABASE_PROD_PROJECT_REF y --confirm-prod=<ref>.`);
    }
  }
  console.log(`Destino: ${ref === DEV_PROJECT_REF ? "DEV" : "PROD"} (${ref})`);
  const email = getEmailSettings();
  if (!email) throw new Error("El email no está configurado (RESEND_API_KEY, QUOTE_EMAIL_FROM, QUOTE_NOTIFY_EMAIL).");

  const retryable: NotificationStatus[] = process.argv.includes("--include-omitted")
    ? ["pendiente", "fallido", "omitido"]
    : ["pendiente", "fallido"];
  const list = retryable.join(",");

  const client = createSupabaseAdminClient(url, key);
  const repo = createSupabaseQuoteRepository(client);
  const { data: rows, error } = await client
    .from("quote_requests")
    .select("*")
    .or(`visitor_email_status.in.(${list}),owner_email_status.in.(${list})`)
    .lt("created_at", new Date(Date.now() - MIN_AGE_MS).toISOString())
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) throw new Error(`No se pudieron leer las solicitudes (${error.code}).`);

  if (!rows?.length) {
    console.log("No hay notificaciones por reintentar.");
    return;
  }

  for (const row of rows) {
    const kinds = (["visitor", "owner"] as NotificationKind[]).filter((kind) => {
      const status = row[`${kind}_email_status`] as NotificationStatus;
      const attempts = row[`${kind}_email_attempts`] as number;
      return retryable.includes(status) && attempts < MAX_ATTEMPTS;
    });
    if (kinds.length === 0) continue;

    const visitor = await sendNotifications(
      { id: row.id, reference: row.reference },
      fromRow(row),
      { repo, email, log: (event, details) => console.warn(event, details) },
      { visitor: row.visitor_email_attempts, owner: row.owner_email_attempts },
      kinds
    );
    console.log(`${row.reference}: ${kinds.join(" + ")} procesado${kinds.includes("visitor") ? ` (visitante: ${visitor})` : ""}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Error inesperado.");
  process.exit(1);
});
