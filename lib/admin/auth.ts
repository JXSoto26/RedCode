import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createAdminSupabase, type AdminSupabase } from "./supabase";

/**
 * Data access layer for /admin. Every page, query and Server Action calls
 * requireAdmin() itself: proxy.ts only refreshes the session, it never
 * authorizes. Being signed in is not enough; the user must be in admin_users.
 */

export type AdminSession =
  | { status: "unconfigured" }
  | { status: "anonymous" }
  | { status: "forbidden"; email: string | null }
  | { status: "admin"; userId: string; email: string; supabase: AdminSupabase };

export const getAdminSession = cache(async (): Promise<AdminSession> => {
  const supabase = await createAdminSupabase();
  if (!supabase) return { status: "unconfigured" };

  // getClaims verifies the JWT; never trust getSession() on the server.
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return { status: "anonymous" };

  const email = typeof claims.email === "string" ? claims.email : null;

  // RLS only lets a user read their own admin_users row.
  const { data: row, error: adminError } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", claims.sub)
    .maybeSingle();
  if (adminError) throw new Error(`admin_check_failed:${adminError.code}`);
  if (!row) return { status: "forbidden", email };

  return { status: "admin", userId: claims.sub, email: email ?? "", supabase };
});

export type Admin = Extract<AdminSession, { status: "admin" }>;

/** Returns the admin or redirects to the login page. */
export async function requireAdmin(): Promise<Admin> {
  const session = await getAdminSession();
  if (session.status === "admin") return session;
  redirect(session.status === "forbidden" ? "/admin/login?error=forbidden" : "/admin/login");
}
