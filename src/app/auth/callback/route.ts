import { NextResponse, type NextRequest } from "next/server";

import { recordMemberAppLoginEvent } from "@/lib/app-login-events";
import { normalizeMemberLoginNextPath } from "@/lib/auth-link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { localeCookieName, normalizeLocale } from "@/lib/i18n/locales";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = normalizeMemberLoginNextPath(requestUrl.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/login?auth=missing-code#_", requestUrl.origin));
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.exchangeCodeForSession(code);
  await supabase.rpc("link_member_for_current_user");
  await supabase.rpc("claim_profile_registration_for_current_email");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let resolvedLocale: string | null = null;

  if (user) {
    const [{ data: member }, { data: profile }] = await Promise.all([
      supabase
        .from("members")
        .select("preferred_locale")
        .eq("user_id", user.id)
        .maybeSingle<{ preferred_locale: string | null }>(),
      supabase
        .from("profile_registrations")
        .select("locale")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ locale: string | null }>(),
      recordMemberAppLoginEvent({ method: "auth_callback", next, userId: user.id }),
    ]);
    resolvedLocale = normalizeLocale(member?.preferred_locale || profile?.locale);
  }

  const response = NextResponse.redirect(new URL(next, requestUrl.origin));
  if (resolvedLocale) {
    response.cookies.set(localeCookieName, resolvedLocale, {
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      sameSite: "lax",
    });
  }

  return response;
}
