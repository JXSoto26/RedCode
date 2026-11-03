import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Internal notes and drafts must never reach the public flow: the public form,
// its endpoint and the emails cannot even reference them. (In the database,
// service_role — the key the public flow uses — has no access to those tables.)
// The public flow and its email retry script. (scripts/prod-*.ts are operator
// tools that name private tables only to check they are NOT publicly readable.)
const PUBLIC_CODE = ["app/api", "app/cotizar", "components/quote", "lib/quote", "scripts/retry-quote-emails.ts"];
const PRIVATE_NAMES = /quote_notes|quote_drafts|quote_draft_items|quote_status_history|internal_notes|admin_users|lib\/admin/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe("the admin panel never uses the secret key", () => {
  // The panel queries as the signed-in admin (publishable key + session) so RLS applies.
  it.each(["lib/admin", "app/admin", "components/admin", "proxy.ts"])("%s", (path) => {
    const full = join(process.cwd(), path);
    const list = statSync(full).isDirectory() ? files(full) : [full];
    const offending = list.filter((f) =>
      /SUPABASE_SECRET_KEY|createSupabaseAdminClient|service_role/.test(readFileSync(f, "utf8"))
    );
    expect(offending).toEqual([]);
  });
});

describe("privacy of internal notes and drafts", () => {
  it.each(PUBLIC_CODE)("%s never references private admin data", (path) => {
    const full = join(process.cwd(), path);
    const offending = (statSync(full).isDirectory() ? files(full) : [full]).filter((f) => PRIVATE_NAMES.test(readFileSync(f, "utf8")));
    expect(offending).toEqual([]);
  });
});

describe("privacy of the price catalog", () => {
  const CATALOG_NAMES = /price_catalog|catalog_code|catalog_version|catalog_price|suggestion_reason|adjustment_note|catalog-rules|catalogCode|suggestionReason|adjustmentNote/;

  it.each(PUBLIC_CODE)("%s never references the catalog or its internal notes", (path) => {
    const full = join(process.cwd(), path);
    const offending = (statSync(full).isDirectory() ? files(full) : [full]).filter((f) => CATALOG_NAMES.test(readFileSync(f, "utf8")));
    expect(offending).toEqual([]);
  });

  it.each(["lib/admin/quote-pdf.ts", "lib/admin/quote-send.ts", "lib/quote/emails.ts"])(
    "%s (what the client receives) shows only the approved items",
    (path) => {
      expect(readFileSync(join(process.cwd(), path), "utf8")).not.toMatch(CATALOG_NAMES);
    }
  );
});
