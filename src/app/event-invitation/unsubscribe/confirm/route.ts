import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  const tokenValue = formData?.get("token");
  const localeValue = formData?.get("locale");
  const token = typeof tokenValue === "string" ? tokenValue.trim() : "";
  const locale = localeValue === "es" ? "es" : "en";
  const redirectUrl = new URL("/event-invitation/unsubscribe", request.nextUrl.origin);
  redirectUrl.searchParams.set("locale", locale);

  if (!token) {
    redirectUrl.searchParams.set("status", "invalid");
    return privateRedirect(redirectUrl);
  }

  const { data, error } = await getSupabaseServiceClient().rpc(
    "unsubscribe_pending_event_invitations",
    { p_token: token },
  );
  const result = data as { ok?: boolean } | null;
  redirectUrl.searchParams.set(
    "status",
    !error && result?.ok ? "success" : "invalid",
  );
  return privateRedirect(redirectUrl);
}

function privateRedirect(url: URL) {
  const response = NextResponse.redirect(url, { status: 303 });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}
