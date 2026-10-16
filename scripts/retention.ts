/**
 * Monthly retention review (operational decision, run by hand; never scheduled).
 *
 *   npm run retention -- plan [--as-of=YYYY-MM-DD] [--only=<request-id>]          DEV, read-only (default)
 *   npm run retention -- execute --env=dev --confirm=<dev-ref> [--only=<id>]      DEV, deletes
 *   npm run retention:prod -- plan                                                 PROD, read-only
 *   npm run retention:prod -- execute --env=prod --confirm=<prod-ref>              PROD, deletes
 *   npm run retention:prod -- erase --only=<id>                                    PROD, read-only check
 *   npm run retention:prod -- erase --only=<id> --env=prod --confirm=<prod-ref>    PROD, deletes one file
 *
 * "erase" handles a deletion requested by the person (manual procedure in the
 * README): one file, ignoring the 12-month rule, but still refusing active
 * clients, documented holds, open/uncertain sends and unreviewed "aceptada".
 *
 * Rule: unconverted requests (relationship "prospecto") with no documented
 * commercial activity in the last 12 months are deleted as a whole file
 * (request, notes, history, drafts, finalized quotes, send log, PDFs).
 * Excluded: active clients, closed relationships (manual review), documented
 * retention holds, open/uncertain sends, "aceptada" without a relationship,
 * and anything with recent activity. See private.retention_review().
 *
 * Safety:
 * - plan never writes. execute needs --env matching the loaded env file,
 *   --confirm repeating the project ref, and an --as-of not in the future.
 * - Each file is re-checked under a row lock right before deleting; while it
 *   is being deleted the admin panel cannot add data to it.
 * - Interrupted runs resume: open jobs are finished first. Storage deletion
 *   is idempotent and verified before the database rows are removed.
 * - DEV uses the repo's CLI link; PROD uses .supabase-prod/ (same checks as
 *   scripts/prod-db.ts). Output has references and counts only, no names or emails.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { DEV_PROJECT_REF } from "../lib/deployment";

const BUCKET = "quote-pdfs";
const ROOT = process.cwd();
const args = process.argv.slice(2);
const command = args[0] ?? "plan";
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1]?.trim() ?? null;

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

// --- Target --------------------------------------------------------------------

const isProd = process.env.REDCODE_ENV_FILE === "prod";
const target = isProd ? "prod" : "dev";
const url = process.env.SUPABASE_URL?.trim() ?? "";
const ref = url ? new URL(url).hostname.replace(/\.supabase\.co$/, "") : "";
const workdir = isProd ? ".supabase-prod" : null;

if (!["plan", "execute", "erase"].includes(command)) fail("Comando: plan | execute | erase");
if (isProd) {
  const prodRef = process.env.SUPABASE_PROD_PROJECT_REF?.trim();
  if (!prodRef || ref !== prodRef || ref === DEV_PROJECT_REF) fail("El .env.prod.local no apunta al proyecto PROD.");
  const linked = join(ROOT, ".supabase-prod", "supabase", ".temp", "project-ref");
  if (!existsSync(linked) || readFileSync(linked, "utf8").trim() !== ref) {
    fail("El workdir PROD no está vinculado a ese proyecto. Ejecuta antes: npm run prod:db -- status --ref=<ref>");
  }
} else {
  if (ref !== DEV_PROJECT_REF) fail("SUPABASE_URL no es el proyecto DEV.");
  const linked = join(ROOT, "supabase", ".temp", "project-ref");
  if (!existsSync(linked) || readFileSync(linked, "utf8").trim() !== DEV_PROJECT_REF) fail("La CLI no está vinculada a DEV (npm run db:target).");
}

const asOfFlag = flag("as-of");
const asOf = asOfFlag ? new Date(`${asOfFlag}T00:00:00Z`) : new Date();
if (Number.isNaN(asOf.getTime())) fail("--as-of debe ser AAAA-MM-DD.");
const only = flag("only");
if (only && !/^[0-9a-f-]{36}$/i.test(only)) fail("--only debe ser el id (uuid) de una solicitud.");

if (command === "erase" && !only) fail("erase necesita --only=<id> (una sola solicitud).");
// erase without --env/--confirm only checks; with either one, both must be right.
const realErase = command === "erase" && (flag("env") !== null || flag("confirm") !== null);
if (command === "execute" || realErase) {
  if (flag("env") !== target) fail(`Para borrar, --env debe ser "${target}" (el entorno cargado).`);
  if (flag("confirm") !== ref) fail(`Para borrar, --confirm debe repetir la referencia del proyecto (${ref}).`);
  if (asOf.getTime() > Date.now()) fail("--as-of no puede estar en el futuro al borrar.");
}

// --- SQL through the Supabase CLI (owner role), never the public API ------------

const tmp = mkdtempSync(join(tmpdir(), "redcode-retention-"));
function sql<T>(query: string): T[] {
  const file = join(tmp, "q.sql");
  writeFileSync(file, query);
  const cli = ["supabase", "db", "query", "--linked", ...(workdir ? ["--workdir", workdir] : []), "-f", `"${file}"`, "-o", "json"];
  const r = spawnSync("npx", cli, { cwd: ROOT, shell: true, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (r.status !== 0) {
    const message = /"message":"([^"]{0,300})/.exec(r.stderr + r.stdout)?.[1] ?? "error desconocido";
    throw new Error(message.replace(/\\n/g, " "));
  }
  return JSON.parse(r.stdout.slice(r.stdout.indexOf("{"))).rows as T[];
}
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

type Review = {
  request_id: string;
  reference: string;
  created_at: string;
  last_activity_at: string;
  last_activity_kind: string;
  relationship: string;
  status: string;
  eligible: boolean;
  reasons: string[];
  notes: number;
  history: number;
  drafts: number;
  quotes: number;
  pdfs: number;
  sends: number;
};
type Job = { job_id: string; pdf_paths: string[]; resumed: boolean };

const day = (iso: string) => iso.slice(0, 10);

function review(): Review[] {
  const rows = sql<Review>(
    `select * from private.retention_review(${lit(asOf.toISOString())}::timestamptz)` +
      (only ? ` where request_id = ${lit(only)}::uuid` : "")
  );
  return rows;
}

function printPlan(rows: Review[]) {
  console.log(`Entorno: ${target.toUpperCase()} (${ref}) · corte: ${asOf.toISOString()} · ${rows.length} solicitudes revisadas`);
  console.log("ref".padEnd(14), "última actividad".padEnd(28), "relación".padEnd(15), "estado".padEnd(18), "decisión / motivos");
  for (const r of rows) {
    console.log(
      r.reference.padEnd(14),
      `${day(r.last_activity_at)} (${r.last_activity_kind})`.padEnd(28),
      r.relationship.padEnd(15),
      r.status.padEnd(18),
      `${r.eligible ? "ELIMINAR" : "conservar"}: ${r.reasons.join(", ")}`
    );
  }
  const eligible = rows.filter((r) => r.eligible);
  const sum = (k: keyof Review) => eligible.reduce((n, r) => n + Number(r[k]), 0);
  console.log(
    `\nCandidatas: ${eligible.length}. Afectaría a: ${eligible.length} solicitudes, ${sum("notes")} notas, ` +
      `${sum("history")} entradas de historial, ${sum("drafts")} borradores, ${sum("quotes")} revisiones, ` +
      `${sum("pdfs")} PDFs, ${sum("sends")} registros de envío.`
  );
  const closed = rows.filter((r) => r.relationship === "cerrado");
  if (closed.length) console.log(`Relaciones cerradas pendientes de revisión manual: ${closed.map((r) => r.reference).join(", ")}`);
}

// --- Storage (PDFs) -------------------------------------------------------------

const storage = () => {
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!key) fail("Falta SUPABASE_SECRET_KEY: hace falta para borrar los PDFs privados (Storage API).");
  return createClient(url, key, { auth: { persistSession: false } }).storage.from(BUCKET);
};

async function removePdfs(paths: string[]) {
  if (paths.length === 0) return;
  const bucket = storage();
  const { error } = await bucket.remove(paths);
  if (error) throw new Error(`storage_remove_failed: ${error.message.slice(0, 80)}`);
  // Verify they are gone before deleting the rows that reference them.
  for (const path of paths) {
    const { data } = await bucket.download(path);
    if (data) throw new Error("storage_file_still_present");
  }
}

async function deleteFile(requestId: string, label: string, onRequest = false) {
  const begin = onRequest
    ? `select * from private.erasure_begin(${lit(requestId)}::uuid)`
    : `select * from private.retention_begin(${lit(requestId)}::uuid, ${lit(asOf.toISOString())}::timestamptz)`;
  const [job] = sql<Job>(begin);
  await removePdfs(job.pdf_paths);
  const [done] = sql<{ retention_finish: Record<string, number> }>(`select private.retention_finish(${lit(job.job_id)}::uuid)`);
  console.log(`✓ ${label}${job.resumed ? " (reanudado)" : ""}: ${JSON.stringify(done.retention_finish)}`);
}

/** Same rule as private.erasure_begin(): the 12-month rule and closed relationships do not block. */
function eraseCheck(r: Review | undefined) {
  if (!r) return "no existe esa solicitud.";
  const ignored = ["excluida:actividad_en_ultimos_12_meses", "excluida:relacion_cerrada_revision_manual"];
  const blocking = r.reasons.filter((x) => !x.startsWith("incluida:") && !ignored.includes(x));
  return blocking.length ? `NO se puede eliminar (${blocking.join(", ")}).` : "se puede eliminar el expediente completo.";
}

// --- Main ---------------------------------------------------------------------------

async function main() {
  const open = sql<{ id: string; request_id: string; started_at: string; pdfs: number }>(
    "select id, request_id, started_at, cardinality(pdf_paths) as pdfs from private.retention_jobs where status = 'en_curso'"
  );
  const rows = review();
  printPlan(rows);
  if (open.length) console.log(`Trabajos interrumpidos que se reanudarán al ejecutar: ${open.length}`);

  if (command === "plan" || (command === "erase" && !realErase)) {
    if (command === "erase") console.log(`\nA petición del titular: ${eraseCheck(rows[0])}`);
    console.log("\nSimulación: no se ha escrito nada.");
    return;
  }

  if (command === "erase") {
    if (!rows[0]) fail("No existe esa solicitud.");
    await deleteFile(rows[0].request_id, rows[0].reference, true);
    console.log("\nEjecución terminada. Revisa ahora Gmail (README, revisión mensual, paso 5).");
    return;
  }

  // Resume interrupted jobs first (their files are already blocked).
  for (const job of open) {
    if (only && job.request_id !== only) continue;
    const ref = rows.find((r) => r.request_id === job.request_id)?.reference ?? "expediente en curso";
    await deleteFile(job.request_id, ref);
  }
  for (const r of rows.filter((x) => x.eligible && !open.some((j) => j.request_id === x.request_id))) {
    try {
      await deleteFile(r.request_id, r.reference);
    } catch (e) {
      const message = e instanceof Error ? e.message : "error";
      if (message.includes("not_eligible")) {
        console.log(`· ${r.reference}: ya no es elegible al volver a comprobar (${message.split("not_eligible: ")[1] ?? ""}); se conserva.`);
        continue;
      }
      throw new Error(`${r.reference}: ${message}. Vuelve a ejecutar el mismo comando para reanudar.`);
    }
  }
  console.log("\nEjecución terminada.");
}

main()
  .catch((e) => {
    console.error("✗", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => rmSync(tmp, { recursive: true, force: true }));
