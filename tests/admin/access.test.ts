import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * App-level authorization: every Server Action and every read must reject a
 * visitor without a session and a signed-in user who is not an admin before
 * touching any data. (The database enforces the same with RLS; see
 * supabase/tests/admin_access.sql for the live checks.)
 */

type Result = { data: unknown; error: { code?: string } | null; count?: number | null };

const state = vi.hoisted(() => ({
  client: null as unknown,
}));

vi.mock("@/lib/admin/supabase", () => ({ createAdminSupabase: async () => state.client }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addNote, changeStatus, login, saveDraft, type DraftState } from "@/lib/admin/actions";
import { getRequestDetail, listRequests, sanitizeSearch } from "@/lib/admin/data";

const ADMIN_ID = "00000000-0000-4000-8000-0000000000a1";
const REQUEST_ID = "3f1c2b8e-6a1d-4c2e-9f3b-1a2b3c4d5e6f";

/** Minimal Supabase double: records table reads and RPC calls. */
function fakeClient(opts: {
  sub?: string | null;
  isAdmin?: boolean;
  rpc?: Result;
  tables?: Record<string, Result>;
  signIn?: { user: { id: string } | null; error: { status?: number } | null };
}) {
  const reads: string[] = [];
  const filters: unknown[][] = [];
  const rpc = vi.fn(async () => opts.rpc ?? { data: 1, error: null });
  const signOut = vi.fn(async () => ({ error: null }));

  const chain = (table: string) => {
    const result = (): Result =>
      table === "admin_users"
        ? { data: opts.isAdmin ? { user_id: opts.sub ?? ADMIN_ID } : null, error: null }
        : opts.tables?.[table] ?? { data: [], error: null, count: 0 };
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "range", "or"]) {
      q[m] = (...args: unknown[]) => {
        filters.push([table, m, ...args]);
        return q;
      };
    }
    q.maybeSingle = async () => result();
    q.then = (resolve: (r: Result) => unknown) => resolve(result());
    return q;
  };

  const client = {
    auth: {
      getClaims: async () =>
        opts.sub ? { data: { claims: { sub: opts.sub, email: "admin@example.com" } }, error: null } : { data: null, error: null },
      signInWithPassword: async () => ({
        data: { user: opts.signIn?.user ?? null },
        error: opts.signIn?.error ?? null,
      }),
      signOut,
    },
    from: (table: string) => {
      reads.push(table);
      return chain(table);
    },
    rpc,
  };
  return { client, reads, filters, rpc, signOut };
}

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

const statusForm = () => form({ requestId: REQUEST_ID, expectedStatus: "nueva", newStatus: "por_aclarar" });
const draftState: DraftState = {
  ok: false,
  errors: [],
  conflict: false,
  version: 2,
  savedAt: null,
  totalCents: null,
  incomplete: false,
};
const draftForm = (items: unknown[] = []) =>
  form({
    payload: JSON.stringify({
      requestId: REQUEST_ID,
      expectedVersion: 2,
      draft: { title: "T", summary: "", deliverables: "", exclusions: "", estimatedTime: "", terms: "", validity: "" },
      items,
    }),
  });

const idle = { ok: false, message: null };

const protectedCalls: [string, () => Promise<unknown>][] = [
  ["changeStatus", () => changeStatus(idle, statusForm())],
  ["addNote", () => addNote(idle, form({ requestId: REQUEST_ID, body: "nota" }))],
  ["saveDraft", () => saveDraft(draftState, draftForm())],
  ["listRequests", () => listRequests({ q: "", status: null, page: 1 })],
  ["getRequestDetail", () => getRequestDetail(REQUEST_ID)],
];

describe("access without a session", () => {
  it.each(protectedCalls)("%s redirects to login and touches no data", async (_name, call) => {
    const fake = fakeClient({ sub: null });
    state.client = fake.client;
    await expect(call()).rejects.toThrow("REDIRECT:/admin/login");
    expect(fake.rpc).not.toHaveBeenCalled();
    expect(fake.reads).toEqual([]);
  });
});

describe("access with a signed-in user who is not an admin", () => {
  it.each(protectedCalls)("%s is refused and touches no request data", async (_name, call) => {
    const fake = fakeClient({ sub: "00000000-0000-4000-8000-0000000000b1", isAdmin: false });
    state.client = fake.client;
    await expect(call()).rejects.toThrow("REDIRECT:/admin/login?error=forbidden");
    expect(fake.rpc).not.toHaveBeenCalled();
    // Only the admin check itself ran.
    expect(fake.reads).toEqual(["admin_users"]);
  });
});

describe("as admin", () => {
  let fake: ReturnType<typeof fakeClient>;
  beforeEach(() => {
    fake = fakeClient({ sub: ADMIN_ID, isAdmin: true });
    state.client = fake.client;
  });

  it("changes the status through the atomic function only", async () => {
    const r = await changeStatus(idle, statusForm());
    expect(r).toEqual({ ok: true, message: "Estado actualizado." });
    expect(fake.rpc).toHaveBeenCalledExactlyOnceWith("admin_set_quote_status", {
      p_request_id: REQUEST_ID,
      p_expected_status: "nueva",
      p_new_status: "por_aclarar",
    });
    // No direct table writes from the app.
    expect(fake.reads).toEqual(["admin_users"]);
  });

  it("validates input before calling the database", async () => {
    for (const bad of [
      form({ requestId: "x", expectedStatus: "nueva", newStatus: "cerrada" }),
      form({ requestId: REQUEST_ID, expectedStatus: "nueva", newStatus: "enviada" }),
    ]) {
      expect((await changeStatus(idle, bad)).ok).toBe(false);
    }
    expect((await addNote(idle, form({ requestId: REQUEST_ID, body: "   " }))).ok).toBe(false);
    expect((await saveDraft(draftState, form({ payload: "{not json" }))).ok).toBe(false);
    expect(
      (await saveDraft(draftState, draftForm([{ description: "x", quantity: "1", unitPrice: "abc" }]))).ok
    ).toBe(false);
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("reports a status changed in another tab", async () => {
    fake = fakeClient({ sub: ADMIN_ID, isAdmin: true, rpc: { data: null, error: { code: "RC409" } } });
    state.client = fake.client;
    const r = await changeStatus(idle, statusForm());
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/otra pestaña/);
  });

  it("refuses a stale draft save and keeps the version it started from", async () => {
    fake = fakeClient({ sub: ADMIN_ID, isAdmin: true, rpc: { data: null, error: { code: "RC409" } } });
    state.client = fake.client;
    const r = await saveDraft(draftState, draftForm());
    expect(r).toMatchObject({ ok: false, conflict: true, version: 2 });
    expect(r.errors[0]).toMatch(/Otra pestaña guardó/);
    expect(fake.rpc.mock.calls[0]).toEqual([
      "admin_save_quote_draft",
      expect.objectContaining({ p_expected_version: 2 }),
    ]);
  });

  it("returns the new version and the server-computed total after saving", async () => {
    fake = fakeClient({ sub: ADMIN_ID, isAdmin: true, rpc: { data: 3, error: null } });
    state.client = fake.client;
    const r = await saveDraft(
      draftState,
      draftForm([
        { description: "Diseño", quantity: "3", unitPrice: "19.99" },
        { description: "Hosting", quantity: "", unitPrice: "10" },
      ])
    );
    expect(r).toMatchObject({ ok: true, version: 3, totalCents: 5997, incomplete: true });
  });

  it("filters the list with a sanitized search term", async () => {
    await listRequests({ q: sanitizeSearch('ana),status.eq.cerrada,"x*%'), status: "nueva", page: 2 });
    const or = fake.filters.find((f) => f[1] === "or");
    expect(or?.[2]).toBe(
      'reference.ilike."*ana status.eq.cerrada x*",business_name.ilike."*ana status.eq.cerrada x*",contact_name.ilike."*ana status.eq.cerrada x*"'
    );
    expect(fake.filters).toContainEqual(["quote_requests", "eq", "status", "nueva"]);
    expect(fake.filters).toContainEqual(["quote_requests", "range", 20, 39]);
  });

  it("returns null for malformed ids without querying", async () => {
    expect(await getRequestDetail("../etc")).toBeNull();
    expect(fake.reads).toEqual([]);
  });
});

describe("login", () => {
  it("does not keep a session for a valid account without admin rights", async () => {
    const fake = fakeClient({
      sub: null,
      isAdmin: false,
      signIn: { user: { id: "00000000-0000-4000-8000-0000000000b1" }, error: null },
    });
    state.client = fake.client;
    const r = await login(idle, form({ email: "user@example.com", password: "x" }));
    expect(r).toEqual({ ok: false, message: "Esta cuenta no tiene acceso al panel." });
    expect(fake.signOut).toHaveBeenCalled();
  });

  it("gives a generic message for wrong credentials", async () => {
    const fake = fakeClient({ signIn: { user: null, error: { status: 400 } } });
    state.client = fake.client;
    const r = await login(idle, form({ email: "a@example.com", password: "bad" }));
    expect(r).toEqual({ ok: false, message: "Email o contraseña incorrectos." });
  });

  it("sends an admin to the requests inbox", async () => {
    const fake = fakeClient({ sub: null, isAdmin: true, signIn: { user: { id: ADMIN_ID }, error: null } });
    state.client = fake.client;
    await expect(login(idle, form({ email: "admin@example.com", password: "x" }))).rejects.toThrow(
      "REDIRECT:/admin/solicitudes"
    );
    expect(fake.signOut).not.toHaveBeenCalled();
  });
});
