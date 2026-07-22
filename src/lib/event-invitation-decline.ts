import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase/admin";

export type EventInvitationDeclineStatus =
  | "already_declined"
  | "deadline_passed"
  | "expired"
  | "invalid"
  | "retry"
  | "unavailable"
  | "valid";

export type EventInvitationDeclineContext = {
  city: string;
  eventFormat: "brunch" | "dinner" | "other";
  eventId: string;
  expiresAt: string;
  invitationId: string;
  locale: "en" | "es";
  memberStatus: "active" | "pending";
  startsAt: string;
  timezone: string;
};

export type EventInvitationDeclineResolution = {
  context?: EventInvitationDeclineContext;
  locale?: "en" | "es";
  status: EventInvitationDeclineStatus;
};

export async function resolveEventInvitationDeclineToken(
  token: string,
): Promise<EventInvitationDeclineResolution> {
  if (!token.trim() || token.length > 512) return { status: "invalid" };

  const { data, error } = await getSupabaseServiceClient().rpc(
    "resolve_event_invitation_decline_token",
    { p_token: token },
  );
  if (error || !isObject(data)) return { status: "retry" };

  const status = declineStatus(data.status);
  const locale = data.locale === "es" ? "es" : data.locale === "en" ? "en" : undefined;
  if (status !== "valid") return { locale, status };

  const eventFormat = data.eventFormat === "brunch" || data.eventFormat === "dinner"
    ? data.eventFormat
    : "other";
  const memberStatus = data.memberStatus === "pending"
    ? "pending"
    : data.memberStatus === "active" ? "active" : null;
  if (
    !locale
    || !memberStatus
    || !isNonEmptyString(data.city)
    || !isNonEmptyString(data.eventId)
    || !isNonEmptyString(data.expiresAt)
    || !isNonEmptyString(data.invitationId)
    || !isNonEmptyString(data.startsAt)
    || !isNonEmptyString(data.timezone)
  ) {
    return { locale, status: "unavailable" };
  }

  return {
    context: {
      city: data.city,
      eventFormat,
      eventId: data.eventId,
      expiresAt: data.expiresAt,
      invitationId: data.invitationId,
      locale,
      memberStatus,
      startsAt: data.startsAt,
      timezone: data.timezone,
    },
    locale,
    status,
  };
}

function declineStatus(value: unknown): EventInvitationDeclineStatus {
  switch (value) {
    case "already_declined":
    case "deadline_passed":
    case "expired":
    case "invalid":
    case "unavailable":
    case "valid":
      return value;
    default:
      return "retry";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}
