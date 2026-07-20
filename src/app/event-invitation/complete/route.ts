import { NextResponse, type NextRequest } from "next/server";

import { normalizeMemberLoginNextPath } from "@/lib/auth-link";
import { resolveActiveMemberEventInvitationAccess } from "@/lib/event-invitation-access";
import { createEventInvitationMemberSession } from "@/lib/event-invitation-member-session";
import { reconcileEventMembershipCheckout } from "@/lib/event-membership-payments";
import {
  getPublicPaymentResult,
  readEventInvitationSessionToken,
  resolveInternalInvitationSession,
} from "@/lib/event-invitations";
import { localeCookieName, normalizeLocale } from "@/lib/i18n/locales";
import { createSupabaseRouteClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sessionToken = readEventInvitationSessionToken(request.cookies, request.nextUrl);
  const accessToken = request.nextUrl.searchParams.get("token")?.trim() || "";
  const activeMemberAccess = accessToken
    ? await resolveActiveMemberEventInvitationAccess(accessToken)
    : null;
  const invitationSession = accessToken
    ? null
    : await resolveInternalInvitationSession(sessionToken);
  const invitationAccess = invitationSession || activeMemberAccess;
  if (!invitationAccess) {
    return redirectToInvitation(request, { access: "invalid" });
  }

  const checkoutSessionId = request.nextUrl.searchParams.get("session_id")?.trim() || "";
  let next = invitationResumePath(invitationAccess);

  if (checkoutSessionId) {
    if (!invitationSession) {
      return redirectToInvitation(request, { payment: "failed" });
    }
    const sync = await reconcileEventMembershipCheckout(
      checkoutSessionId,
      invitationSession.invitationId,
    );
    const paymentResult = sync.result || await getPublicPaymentResult(
      sessionToken,
      checkoutSessionId,
    );

    if (paymentResult?.status === "payment_pending" || sync.status === "pending") {
      return redirectToInvitation(request, {
        payment: "pending",
        session_id: checkoutSessionId,
      });
    }
    if (!paymentResult?.ok || paymentResult.status === "failed") {
      console.error("[event-invitation-complete] payment verification failed", {
        error: sync.error || "Missing successful payment result",
        invitationId: invitationSession.invitationId,
      });
      return redirectToInvitation(request, {
        payment: "failed",
        session_id: checkoutSessionId,
      });
    }

    next = paymentConfirmedResumePath(
      normalizeMemberLoginNextPath(paymentResult.loginNext, "/going-out"),
    );
  }

  const activeInvitationSession = invitationSession
    ? await resolveInternalInvitationSession(sessionToken)
    : null;
  const memberAccess = activeInvitationSession?.membershipStatus === "active"
    ? {
        email: activeInvitationSession.email,
        locale: activeInvitationSession.locale,
        memberId: activeInvitationSession.memberId,
      }
    : activeMemberAccess;
  if (!memberAccess) {
    console.error("[event-invitation-complete] membership is not active", {
      invitationId: invitationSession?.invitationId || activeMemberAccess?.invitationId,
    });
    return redirectToInvitation(request, {
      payment: checkoutSessionId ? "failed" : "session_failed",
    });
  }

  const response = NextResponse.redirect(new URL(next, request.nextUrl.origin), { status: 303 });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");

  const memberSession = await createEventInvitationMemberSession({
    email: memberAccess.email,
    expectedMemberId: memberAccess.memberId,
    locale: memberAccess.locale,
    next,
    supabaseClient: createSupabaseRouteClient(request, response),
  });
  if (!memberSession.ok) {
    console.error("[event-invitation-complete] member session creation failed", {
      error: memberSession.error,
      invitationId: invitationSession?.invitationId || activeMemberAccess?.invitationId,
    });
    return redirectToInvitation(request, { payment: "session_failed" });
  }

  response.cookies.set(
    localeCookieName,
    normalizeLocale(memberSession.preferredLocale || memberAccess.locale),
    {
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      sameSite: "lax",
    },
  );
  return response;
}

function invitationResumePath(invitation: {
  invitationId: string;
  responseStatus: string;
  seatStatus: string;
}) {
  return invitation.responseStatus === "invited" && invitation.seatStatus === "none"
    ? `/going-out?apply=${encodeURIComponent(invitation.invitationId)}`
    : "/going-out";
}

function paymentConfirmedResumePath(next: string) {
  const url = new URL(next, "http://oneplusone.local");
  url.searchParams.set("payment", "confirmed");
  return `${url.pathname}${url.search}${url.hash}`;
}

function redirectToInvitation(
  request: NextRequest,
  params: Record<string, string>,
) {
  const url = new URL("/event-invitation", request.nextUrl.origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = NextResponse.redirect(url, { status: 303 });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
