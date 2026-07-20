import { NextResponse, type NextRequest } from "next/server";

import { deliverMemberEventEmail } from "@/lib/event-email-delivery";
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
      : await refreshExpiredInvitationLink(token);
    stableUrl.searchParams.set("access", accessStatus);
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

async function refreshExpiredInvitationLink(token: string) {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "refresh_expired_event_invitation_link",
    { p_token: token },
  );
  const refresh = data as {
    deliveryId?: string;
    ok?: boolean;
    status?: string;
  } | null;

  if (error || refresh?.status === "invalid" || refresh?.status === "valid") {
    return "invalid";
  }
  if (refresh?.status === "deadline_passed") return "deadline";
  if (refresh?.ok && refresh.status === "already_sent") return "resent";
  if (!refresh?.ok || !refresh.deliveryId) return "unavailable";

  const delivery = await deliverMemberEventEmail(refresh.deliveryId);
  return delivery.ok ? "resent" : "retry";
}

function privateRedirect(url: URL) {
  const response = NextResponse.redirect(url, { status: 303 });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}
