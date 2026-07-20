import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { buildMemberLoginPath } from "@/lib/auth-link";
import { isLocale, localeCookieName } from "@/lib/i18n/locales";
import { getSupabaseAuthCookieOptions } from "@/lib/supabase/auth-cookie";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";

const memberAppPaths = [
  "/credits",
  "/dashboard",
  "/events",
  "/going-out",
  "/messages",
  "/my-story",
  "/preferences",
] as const;

function isMemberAppPath(pathname: string) {
  return memberAppPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export async function middleware(request: NextRequest) {
  const requestedLocale = request.nextUrl.searchParams.get("locale");

  if (isLocale(requestedLocale)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.searchParams.delete("locale");

    const redirectResponse = NextResponse.redirect(redirectUrl);
    redirectResponse.cookies.set(localeCookieName, requestedLocale, {
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      sameSite: "lax",
    });

    return redirectResponse;
  }

  let response = NextResponse.next({ request });

  const supabaseConfig = getPublicSupabaseConfig();

  if (!supabaseConfig) return response;

  const { supabaseAnonKey, supabaseUrl } = supabaseConfig;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: getSupabaseAuthCookieOptions(supabaseUrl),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Preserve the destination only for the logged-out redirect. Do not inject it
  // into request headers: middleware also sees React's internal refresh requests.
  if (!user && isMemberAppPath(request.nextUrl.pathname)) {
    const requestedPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    const redirectResponse = NextResponse.redirect(
      new URL(buildMemberLoginPath(requestedPath), request.url),
    );

    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });

    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/location(?:/|$)|api/stripe/webhook(?:/|$)|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
