/**
 * Supabase PROD operations, kept apart from the everyday DEV link.
 *
 *   npm run prod:db -- check   --ref=<prod-ref>
 *   npm run prod:db -- status  --ref=<prod-ref>
 *   npm run prod:db -- migrate --ref=<prod-ref>                          # dry run: lists what would apply
 *   npm run prod:db -- migrate --ref=<prod-ref> --apply --confirm=<prod-ref>
 *
 * Safety:
 * - Uses its own workdir (.supabase-prod/, git-ignored) with its own link, so
 *   the repo's CLI link stays on DEV and `npm run db:target` is unchanged.
 * - The ref must not be DEV, must equal SUPABASE_PROD_PROJECT_REF (from
 *   .env.prod.local) and must belong to the Supabase project named "redcode-prod".
 * - Applying needs --apply and --confirm repeating the ref.
 * - Never runs tests, fixtures or seeds, and never copies data.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DEV_PROJECT_REF } from "../lib/deployment";

const PROD_NAME = "redcode-prod";
const ROOT = process.cwd();
const WORKDIR = join(ROOT, ".supabase-prod");
// Relative to ROOT (the CLI runs there): no spaces from the user's home path.
const CLI_WORKDIR = ".supabase-prod";

const args = process.argv.slice(2);
const command = args[0];
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1]?.trim() ?? null;
const ref = flag("ref");

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function supabase(cliArgs: string[], opts: { capture?: boolean } = {}) {
  // shell: true (npx on Windows) splits on spaces: quote any argument that has them.
  const quoted = cliArgs.map((a) => (/\s/.test(a) ? `"${a}"` : a));
  const r = spawnSync("npx", ["supabase", ...quoted], {
    cwd: ROOT,
    shell: true,
    encoding: "utf8",
    stdio: opts.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (r.status !== 0) fail(`supabase ${cliArgs[0]} falló.`);
  return r.stdout ?? "";
}

function checkTarget(): string {
  if (process.env.REDCODE_ENV_FILE !== "prod") {
    fail("No se cargó .env.prod.local. Usa npm run prod:db (carga --env-file=.env.prod.local).");
  }
  if (!["check", "status", "migrate"].includes(command)) fail("Comando: check | status | migrate");
  if (!ref || !/^[a-z]{20}$/.test(ref)) fail("Indica --ref=<ref de 20 letras del proyecto PROD>.");
  if (ref === DEV_PROJECT_REF) fail("Esa referencia es el proyecto DEV.");

  const expected = process.env.SUPABASE_PROD_PROJECT_REF?.trim();
  if (!expected) fail("Falta SUPABASE_PROD_PROJECT_REF (ejecuta con --env-file=.env.prod.local).");
  if (expected !== ref) fail(`--ref (${ref}) no coincide con SUPABASE_PROD_PROJECT_REF (${expected}).`);

  const projects = JSON.parse(supabase(["projects", "list", "-o", "json"], { capture: true })) as
    | { projects: { ref: string; name: string; status: string }[] }
    | { ref: string; name: string; status: string }[];
  const list = Array.isArray(projects) ? projects : projects.projects;
  const project = list.find((p) => p.ref === ref);
  if (!project) fail(`No existe un proyecto con la referencia ${ref} en esta cuenta.`);
  if (project.name !== PROD_NAME) fail(`El proyecto ${ref} se llama "${project.name}", no "${PROD_NAME}".`);
  if (project.status !== "ACTIVE_HEALTHY") fail(`El proyecto ${PROD_NAME} no está activo (${project.status}).`);
  console.log(`✓ Destino PROD: ${project.name} (${ref})`);
  return ref;
}

/** Fresh copy of config + migrations in the PROD workdir, linked to PROD only. */
function prepareWorkdir(target: string) {
  const dir = join(WORKDIR, "supabase");
  rmSync(join(dir, "migrations"), { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(join(ROOT, "supabase", "config.toml"), join(dir, "config.toml"));
  cpSync(join(ROOT, "supabase", "migrations"), join(dir, "migrations"), { recursive: true });

  const linked = join(dir, ".temp", "project-ref");
  const current = existsSync(linked) ? readFileSync(linked, "utf8").trim() : null;
  if (current !== target) supabase(["link", "--project-ref", target, "--workdir", CLI_WORKDIR]);
  const after = readFileSync(linked, "utf8").trim();
  if (after !== target) fail(`El workdir PROD quedó vinculado a ${after}, no a ${target}.`);

  // The everyday link must still be DEV.
  const devLink = join(ROOT, "supabase", ".temp", "project-ref");
  if (existsSync(devLink) && readFileSync(devLink, "utf8").trim() !== DEV_PROJECT_REF) {
    fail("El vínculo habitual del repo ya no apunta a DEV. Revísalo antes de seguir.");
  }
}

const target = checkTarget();
if (command === "check") process.exit(0);

prepareWorkdir(target);

if (command === "status") {
  supabase(["migration", "list", "--linked", "--workdir", CLI_WORKDIR]);
  process.exit(0);
}

// migrate
supabase(["db", "push", "--linked", "--dry-run", "--workdir", CLI_WORKDIR]);
if (!args.includes("--apply")) {
  console.log("Dry run: no se aplicó nada. Para aplicar, repite con --apply --confirm=<ref>.");
  process.exit(0);
}
if (flag("confirm") !== target) fail("Para aplicar, --confirm debe repetir exactamente la referencia PROD.");
supabase(["db", "push", "--linked", "--workdir", CLI_WORKDIR, "--yes"]);
supabase(["migration", "list", "--linked", "--workdir", CLI_WORKDIR]);
console.log("✓ Migraciones aplicadas en PROD. Ejecuta ahora: npm run prod:verify");
