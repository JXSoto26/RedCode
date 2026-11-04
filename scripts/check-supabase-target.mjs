/**
 * Guard for every Supabase CLI command that touches the remote database.
 *
 *   npm run db:target
 *
 * Fails unless the project linked with `supabase link` is the DEV project in
 * .env.local (SUPABASE_DEV_PROJECT_REF) and SUPABASE_URL points to that same
 * project. Prints only the project ref, never keys.
 */
import { readFileSync } from "node:fs";

const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

const devRef = process.env.SUPABASE_DEV_PROJECT_REF?.trim();
const url = process.env.SUPABASE_URL?.trim();
if (!devRef || !url) fail("Faltan SUPABASE_DEV_PROJECT_REF o SUPABASE_URL en .env.local.");

let linkedRef;
try {
  linkedRef = readFileSync("supabase/.temp/project-ref", "utf8").trim();
} catch {
  fail("La CLI no está vinculada. Ejecuta: npx supabase link --project-ref <ref-dev>");
}

if (linkedRef !== devRef) fail(`La CLI está vinculada a ${linkedRef}, no al proyecto DEV ${devRef}.`);
if (new URL(url).hostname !== `${devRef}.supabase.co`) fail("SUPABASE_URL no apunta al proyecto DEV.");

console.log(`✓ Supabase vinculado a DEV: ${linkedRef}`);
