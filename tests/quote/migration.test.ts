import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ASSET_STATUSES,
  BUSINESS_TYPES,
  FEATURES,
  NOTIFICATION_STATUSES,
  REQUEST_STATUSES,
  SECTIONS,
  SERVICES,
} from "@/lib/quote/options";

// Static checks on the SQL. The live check against Supabase DEV is in tests/dev.
const dir = join(process.cwd(), "supabase", "migrations");
const sql = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(dir, f), "utf8"))
  .join("\n")
  .toLowerCase();

const quoted = (values: readonly string[]) => values.map((v) => `'${v}'`).join(", ");

describe("quote_requests migration", () => {
  it("enables RLS on every table and defines no policies", () => {
    expect(sql).toContain("alter table public.quote_requests enable row level security");
    expect(sql).toContain("alter table public.quote_rate_limits enable row level security");
    expect(sql).not.toMatch(/create policy/);
  });

  it("revokes all privileges from public roles", () => {
    expect(sql).toContain("revoke all on table public.quote_requests from public, anon, authenticated");
    expect(sql).toContain("revoke all on table public.quote_rate_limits from public, anon, authenticated");
    expect(sql).toMatch(/revoke all on function public\.quote_rate_limit_hit\([^)]*\) from public, anon, authenticated/);
    expect(sql).not.toMatch(/grant [^;]* to (anon|authenticated|public)\b/);
  });

  it("does not let service_role delete requests", () => {
    expect(sql).toContain("grant select, insert, update on table public.quote_requests to service_role");
  });

  it("uses unique, non-sequential references and idempotency keys", () => {
    expect(sql).toContain("constraint quote_requests_reference_unique unique (reference)");
    expect(sql).toContain("constraint quote_requests_idempotency_key_unique unique (idempotency_key)");
    expect(sql).toMatch(/id uuid primary key default gen_random_uuid\(\)/);
    expect(sql).not.toMatch(/serial|identity/);
  });

  it("starts requests as 'nueva' and only allows the agreed statuses", () => {
    expect(sql).toContain("status text not null default 'nueva'");
    expect(sql).toContain(`status in (${quoted(REQUEST_STATUSES)})`);
  });

  it("mirrors the allowed option values from lib/quote/options.ts", () => {
    expect(sql).toContain(`business_type in (${quoted(BUSINESS_TYPES.map((o) => o.value))})`);
    expect(sql).toContain(`service in (${quoted(SERVICES.map((o) => o.value))})`);
    expect(sql).toContain(`array[${quoted(SECTIONS.map((o) => o.value))}]`);
    expect(sql).toContain(`array[${quoted(FEATURES.map((o) => o.value))}]`);
    expect(sql).toContain(`logo_status in (${quoted(ASSET_STATUSES.map((o) => o.value))})`);
    expect(sql).toContain(`visitor_email_status in (${quoted(NOTIFICATION_STATUSES)})`);
  });

  it("records consent and its text version", () => {
    expect(sql).toContain("consent_version text not null");
    expect(sql).toContain("consented_at timestamptz not null");
    expect(sql).toContain("check (consent_accepted)");
  });

  it("has no columns for attachments or secrets", () => {
    const columns = [...sql.matchAll(/^\s+([a-z_]+)\s+(?:text|bytea|jsonb|uuid|integer|boolean|date|timestamptz)\b/gm)].map(
      (m) => m[1]
    );
    expect(columns).toContain("email");
    expect(columns.filter((c) => /attachment|file|secret|api_key|token|password/.test(c))).toEqual([]);
  });
});
