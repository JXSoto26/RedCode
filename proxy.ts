import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE_OPTIONS, adminSupabaseConfig } from "@/lib/admin/supabase-config";

/**
 * Refreshes the Supabase session for /admin before pages render, as the
 * Supabase SSR guide recommends. This is NOT authorization: every page and
 * Server Action checks the admin itself (lib/admin/auth.ts).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = adminSupabaseConfig();
  if (!config) return response;

  const supabase = createServerClient(config.url, config.key, {
    cookieOptions: ADMIN_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // Do not run code between createServerClient and getClaims (Supabase guide).
  const { data } = await supabase.auth.getClaims();

  // Without a valid session, answer page loads with a real redirect instead of
  // streaming the loading skeleton first. Convenience only: the admin check
  // that protects data still runs in every page and Server Action.
  const isPageLoad = request.method === "GET" || request.method === "HEAD";
  if (!data?.claims && isPageLoad && request.nextUrl.pathname !== "/admin/login") {
    const redirect = NextResponse.redirect(new URL("/admin/login", request.url));
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
