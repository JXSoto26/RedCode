import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REQUEST_STATUSES } from "@/lib/quote/options";

// Static checks on the admin panel SQL. The live checks (anon, signed-in
// non-admin, admin, service_role) are in supabase/tests/admin_access.sql.
const dir = join(process.cwd(), "supabase", "migrations");
const file = readdirSync(dir).find((f) => f.endsWith("_admin_panel.sql"))!;
const sql = readFileSync(join(dir, file), "utf8").toLowerCase();
const allSql = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(dir, f), "utf8"))
  .join("\n")
  .toLowerCase();

const NEW_TABLES = ["admin_users", "quote_status_history", "quote_notes", "quote_drafts", "quote_draft_items"];
const RPCS = ["admin_set_quote_status", "admin_add_quote_note", "admin_save_quote_draft"];

const functionBody = (name: string) => {
  const match = new RegExp(`create function public\\.${name}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`).exec(sql);
  if (!match) throw new Error(`function ${name} not found`);
  return { header: match[0].slice(0, match[0].indexOf("$$")), body: match[1] };
};

describe("admin panel migration", () => {
  it("enables RLS and revokes everything (service_role included) on every new table", () => {
    for (const t of NEW_TABLES) {
      expect(sql).toContain(`alter table public.${t} enable row level security`);
      expect(sql).toContain(`revoke all on table public.${t} from public, anon, authenticated, service_role`);
    }
  });

  it("grants nothing to anon or public", () => {
    expect(sql).not.toMatch(/grant [^;]* to (anon|public)\b/);
  });

  it("only grants SELECT on tables to authenticated: writes go through the admin functions", () => {
    const tableGrants = [...sql.matchAll(/grant ([^;]*?) on table ([^;]*?) to ([^;]*);/g)];
    expect(tableGrants.length).toBeGreaterThan(0);
    for (const [, privileges, , role] of tableGrants) {
      expect(privileges.trim()).toBe("select");
      expect(role.trim()).toBe("authenticated");
    }
  });

  it("restricts every read policy to admins, except a user reading their own admin row", () => {
    const policies = [...sql.matchAll(/create policy (\w+) on public\.(\w+)\s+for (\w+) to (\w+)\s+using \(([^;]*)\);/g)];
    expect(policies.map((p) => p[2]).sort()).toEqual([...NEW_TABLES, "quote_requests"].sort());
    for (const [, name, table, command, role, using] of policies) {
      expect(command, name).toBe("select");
      expect(role, name).toBe("authenticated");
      if (table === "admin_users") expect(using).toBe("user_id = (select auth.uid())");
      else expect(using).toBe("(select private.is_admin())");
    }
  });

  it("never lets anyone add admins through the API", () => {
    expect(sql).not.toMatch(/grant [^;]*(insert|update|delete|all)[^;]* on table public\.admin_users/);
  });

  it("checks the admin first in every write function, with a fixed search_path", () => {
    for (const name of RPCS) {
      const { header, body } = functionBody(name);
      expect(header).toContain("security definer");
      expect(header).toContain("set search_path = ''");
      // The very first statement after BEGIN is the admin check.
      expect(body.slice(body.search(/^begin$/m))).toMatch(
        /^begin\s+if not private\.is_admin\(\) then\s+raise exception 'forbidden' using errcode = 'rc403'/
      );
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated, service_role`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to authenticated;`));
    }
  });

  it("records status history in the same function that changes the status, with optimistic locking", () => {
    const { body } = functionBody("admin_set_quote_status");
    expect(body).toContain("for update");
    expect(body).toContain("is distinct from p_expected_status");
    expect(body).toMatch(/update public\.quote_requests set status[\s\S]*insert into public\.quote_status_history/);
  });

  it("rejects stale draft saves instead of overwriting", () => {
    const { body } = functionBody("admin_save_quote_draft");
    expect(body).toContain("where quote_request_id = p_request_id and version = p_expected_version");
    expect(body).toContain("version = version + 1");
    expect(body).toContain("on conflict (quote_request_id) do nothing");
    // Saving a draft never touches the request status.
    expect(body).not.toContain("update public.quote_requests");
  });

  it("stores money as integer cents and quantities as exact decimals", () => {
    expect(sql).toContain("unit_price_cents bigint");
    expect(sql).toContain("quantity numeric(10, 2)");
    expect(sql).not.toMatch(/\b(real|double precision|float\d?)\b/);
  });

  it("mirrors the request statuses from lib/quote/options.ts", () => {
    const list = REQUEST_STATUSES.map((s) => `'${s}'`).join(", ");
    expect(sql).toContain(`from_status in (${list})`);
    expect(sql).toContain(`p_new_status not in (${list})`);
  });

  it("never deletes, drops or truncates quote requests in any migration", () => {
    expect(allSql).not.toMatch(/delete from public\.quote_requests|drop table|truncate/);
  });
});
