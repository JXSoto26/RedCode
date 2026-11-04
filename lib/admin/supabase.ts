import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { ADMIN_COOKIE_OPTIONS, adminSupabaseConfig } from "./supabase-config";

/**
 * Supabase client bound to the current visitor's session cookies. Queries run
 * as that user (publishable key + their JWT), so RLS decides what they see.
 * Returns null when admin auth is not configured.
 */
export async function createAdminSupabase() {
  const config = adminSupabaseConfig();
  if (!config) return null;
  const cookieStore = await cookies();

  return createServerClient(config.url, config.key, {
    cookieOptions: ADMIN_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components cannot set cookies; proxy.ts refreshes the session.
        }
      },
    },
  });
}

export type AdminSupabase = NonNullable<Awaited<ReturnType<typeof createAdminSupabase>>>;
