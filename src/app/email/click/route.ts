import { NextResponse, type NextRequest } from "next/server";

import { eventEmailClickDestination } from "@/lib/event-email-click";
import { resolveActiveMemberEventInvitationAccess } from "@/lib/event-invitation-access";
import { createFeedbackEmailLoginRedirect } from "@/lib/feedback-email-login";
import { getSupabaseServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim() || "";
  const destination = eventEmailClickDestination(
    request.nextUrl.searchParams.get("to") || "",
    request.nextUrl.origin,
  );

  let clickDeliveryId = "";
  let useDurableInvitationAccess = false;
  if (token) {
    const { data, error } = await getSupabaseServiceClient().rpc(
      "record_event_email_click",
      { p_token: token },
    );
    if (error) {
      console.error("[event-email-click] could not record click", {
        code: error.code,
        message: error.message,
      });
    } else if (data && typeof data === "object" && !Array.isArray(data)) {
      const deliveryId = (data as Record<string, unknown>).deliveryId;
      clickDeliveryId = typeof deliveryId === "string" ? deliveryId : "";
    }

    if (destination.pathname === "/auth/confirm") {
      useDurableInvitationAccess = Boolean(
        await resolveActiveMemberEventInvitationAccess(token),
      );
    }
  }

  let feedbackLoginUrl: string | null = null;
  if (clickDeliveryId) {
    try {
      feedbackLoginUrl = await createFeedbackEmailLoginRedirect({
        deliveryId: clickDeliveryId,
        destination,
        origin: request.nextUrl.origin,
      });
    } catch (error) {
      console.error("[event-email-click] could not create feedback login", {
        message: error instanceof Error ? error.message : "Unknown feedback login error.",
      });
    }
  }

  const resolvedDestination = useDurableInvitationAccess
    ? new URL(
        `/event-invitation/complete?token=${encodeURIComponent(token)}`,
        request.nextUrl.origin,
      )
    : feedbackLoginUrl
      ? new URL(feedbackLoginUrl)
      : destination;
  const response = NextResponse.redirect(resolvedDestination, { status: 307 });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}
