import { NextResponse, type NextRequest } from "next/server";

import { deliverMemberEventEmailFromResult } from "@/lib/event-email-delivery";
import { resolveEventInvitationDeclineToken } from "@/lib/event-invitation-decline";
import { isEventInvitationDeclineReasonForFormat } from "@/lib/event-invitation-decline-reasons";
import { getSupabaseServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  const token = formString(formData, "token");
  const reason = formString(formData, "reason");
  const details = formString(formData, "details");
  const locale = formString(formData, "locale") === "es" ? "es" : "en";

  if (!token || token.length > 512) {
    return declineRedirect(request, { locale, status: "invalid" });
  }

  const resolution = await resolveEventInvitationDeclineToken(token);
  const resolvedLocale = resolution.locale || locale;
  if (resolution.status !== "valid" || !resolution.context) {
    return declineRedirect(request, {
      locale: resolvedLocale,
      status: resolution.status,
    });
  }

  const validReason = (
    resolution.context.memberStatus === "pending"
    && reason === "event_type_not_interested"
  ) || isEventInvitationDeclineReasonForFormat(
    reason,
    resolution.context.eventFormat,
  );
  if (!validReason || details.length > 500) {
    return declineRedirect(request, {
      locale: resolvedLocale,
      status: "validation",
      token,
    });
  }

  const { data, error } = await getSupabaseServiceClient().rpc(
    "decline_event_invitation_from_token",
    { p_details: details || null, p_reason: reason, p_token: token },
  );
  const result = isObject(data) ? data : null;
  const resultLocale = result?.locale === "es" ? "es" : resolvedLocale;

  if (error) {
    console.error("Event invitation decline RPC failed.", { code: error.code });
    const refreshed = await resolveEventInvitationDeclineToken(token);
    return declineRedirect(request, {
      locale: refreshed.locale || resultLocale,
      status: refreshed.status === "valid" ? "retry" : refreshed.status,
      token: refreshed.status === "valid" ? token : undefined,
    });
  }

  if (!result?.ok) {
    const status = publicStatus(result?.status);
    return declineRedirect(request, { locale: resultLocale, status });
  }

  if (result.status === "already_declined") {
    return declineRedirect(request, { locale: resultLocale, status: "already_declined" });
  }

  const delivery = await deliverMemberEventEmailFromResult(result);
  if (!delivery.ok) {
    console.error("Event decline acknowledgement remains queued for retry.");
  }

  return declineRedirect(request, { locale: resultLocale, status: "success" });
}

function declineRedirect(
  request: NextRequest,
  { locale, status, token }: { locale: "en" | "es"; status: string; token?: string },
) {
  const url = new URL("/event-invitation/decline", request.nextUrl.origin);
  url.searchParams.set("locale", locale);
  url.searchParams.set("status", status);
  if (token) url.searchParams.set("token", token);

  const response = NextResponse.redirect(url, { status: 303 });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

function publicStatus(value: unknown) {
  switch (value) {
    case "already_declined":
    case "deadline_passed":
    case "expired":
    case "invalid":
    case "unavailable":
      return value;
    default:
      return "unavailable";
  }
}

function formString(formData: FormData | null, name: string) {
  const value = formData?.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
