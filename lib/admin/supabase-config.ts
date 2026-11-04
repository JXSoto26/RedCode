import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Settings shared by proxy.ts and the server client. Plain module (no
 * "server-only") because proxy.ts runs outside React Server Components.
 *
 * Admin auth uses the publishable key plus the visitor's session, so every
 * query runs under RLS as that user. The secret key is never used here.
 */
export function adminSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  return url && key ? { url, key } : null;
}

/**
 * Session cookies: only sent to /admin, never readable from JavaScript (there
 * is no browser Supabase client), HTTPS-only outside local development.
 */
export const ADMIN_COOKIE_OPTIONS: CookieOptionsWithName = {
  path: "/admin",
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
};
