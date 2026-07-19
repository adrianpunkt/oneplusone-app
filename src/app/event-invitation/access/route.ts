import { NextResponse, type NextRequest } from "next/server";

import { eventInvitationSessionCookie } from "@/lib/event-invitations";
import { getSupabaseServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim() || "";
  const stableUrl = new URL("/event-invitation", request.nextUrl.origin);

  if (!token) {
    stableUrl.searchParams.set("access", "invalid");
    return privateRedirect(stableUrl);
  }

  const { data, error } = await getSupabaseServiceClient().rpc(
    "claim_event_invitation_access_token",
    { p_session_ttl_minutes: 1440, p_token: token },
  );
  const result = data as {
    expiresAt?: string;
    maxAgeSeconds?: number;
    ok?: boolean;
    sessionToken?: string;
  } | null;
  if (error || !result?.ok || !result.sessionToken) {
    stableUrl.searchParams.set("access", "invalid");
    return privateRedirect(stableUrl);
  }

  const response = privateRedirect(stableUrl);
  response.cookies.set(eventInvitationSessionCookie, result.sessionToken, {
    httpOnly: true,
    maxAge: Math.max(1, Number(result.maxAgeSeconds || 0)),
    path: "/",
    sameSite: "lax",
    secure: true,
  });
  return response;
}

function privateRedirect(url: URL) {
  const response = NextResponse.redirect(url, { status: 303 });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}
