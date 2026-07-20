import { NextResponse, type NextRequest } from "next/server";

import {
  preflightEventInvitationAccess,
  resolveActiveMemberEventInvitationAccess,
} from "@/lib/event-invitation-access";
import { eventInvitationSessionCookieSettings } from "@/lib/event-invitations";
import { getSupabaseServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  const tokenValue = formData?.get("token");
  const token = typeof tokenValue === "string" ? tokenValue.trim() : "";
  const stableUrl = new URL("/event-invitation", request.nextUrl.origin);

  if (!token) {
    stableUrl.searchParams.set("access", "invalid");
    return privateRedirect(stableUrl);
  }

  const activeMemberAccess = await resolveActiveMemberEventInvitationAccess(token);
  if (activeMemberAccess) {
    const completeUrl = new URL("/event-invitation/complete", request.nextUrl.origin);
    completeUrl.searchParams.set("token", token);
    return privateRedirect(completeUrl);
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
    status?: string;
  } | null;
  if (error || !result?.ok || !result.sessionToken) {
    const accessStatus = result?.status === "deadline_passed"
      ? "deadline"
      : await preflightEventInvitationAccess(token);
    stableUrl.searchParams.set(
      "access",
      accessStatus === "valid" ? "invalid" : accessStatus,
    );
    return privateRedirect(stableUrl);
  }

  const response = privateRedirect(stableUrl);
  const cookie = eventInvitationSessionCookieSettings(request.nextUrl);
  response.cookies.set(cookie.name, result.sessionToken, {
    httpOnly: true,
    maxAge: Math.max(1, Number(result.maxAgeSeconds || 0)),
    path: "/",
    sameSite: "lax",
    secure: cookie.secure,
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
