import { getSupabaseServiceClient } from "@/lib/supabase/admin";
import type {
  InvitationPaymentStatus,
  InvitationResponseStatus,
  InvitationSeatStatus,
  InvitationWaitlistReason,
  PublicEventPaymentResult,
  PublicInvitationSession,
} from "@/lib/types";

export const eventInvitationSessionCookie = "__Host-oneplusone-event-invitation";
export const localEventInvitationSessionCookie = "oneplusone-event-invitation";

type InvitationCookieReader = {
  get(name: string): { value: string } | undefined;
};

export function readEventInvitationSessionToken(
  cookieStore: InvitationCookieReader,
  requestUrl?: URL,
) {
  const secureToken = cookieStore.get(eventInvitationSessionCookie)?.value || "";
  if (secureToken) return secureToken;

  const allowLocalCookie = requestUrl
    ? isLocalHttpUrl(requestUrl)
    : process.env.NODE_ENV !== "production";
  return allowLocalCookie
    ? cookieStore.get(localEventInvitationSessionCookie)?.value || ""
    : "";
}

export function eventInvitationSessionCookieSettings(url: URL) {
  const secure = !isLocalHttpUrl(url);
  return {
    name: secure ? eventInvitationSessionCookie : localEventInvitationSessionCookie,
    secure,
  };
}

function isLocalHttpUrl(url: URL) {
  return url.protocol === "http:"
    && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

type InternalInvitationSession = {
  email: string;
  eventId: string;
  expiresAt: string;
  invitationId: string;
  locale: "en" | "es";
  memberId: string;
  membershipStatus: "pending" | "active" | "cancelled";
  ok: true;
  paymentStatus: InvitationPaymentStatus;
  priorityAt: string | null;
  responseStatus: InvitationResponseStatus;
  seatStatus: InvitationSeatStatus;
  sessionId: string;
  waitlistReason: InvitationWaitlistReason;
};

export async function resolveInternalInvitationSession(sessionToken: string) {
  if (!sessionToken) return null;
  const { data, error } = await getSupabaseServiceClient().rpc(
    "resolve_event_invitation_session",
    { p_session_token: sessionToken },
  );
  if (error) return null;
  const session = data as InternalInvitationSession | { ok?: false } | null;
  return session?.ok ? (session as InternalInvitationSession) : null;
}

export async function getPublicInvitationSession(
  sessionToken: string,
): Promise<PublicInvitationSession | null> {
  const session = await resolveInternalInvitationSession(sessionToken);
  if (!session) return null;

  const supabase = getSupabaseServiceClient();
  const [{ data: event }, { data: summary }, { data: decline }] = await Promise.all([
    supabase
      .from("events")
      .select("id,starts_at,ends_at,timezone,city,event_format,language_code,capacity,gender_balance_enabled,rsvp_deadline_at,credit_cost,status")
      .eq("id", session.eventId)
      .maybeSingle<{
        capacity: number;
        city: string | null;
        credit_cost: number;
        ends_at: string | null;
        event_format: "dinner" | "brunch" | "other";
        gender_balance_enabled: boolean;
        id: string;
        language_code: "en" | "es" | null;
        rsvp_deadline_at: string;
        starts_at: string;
        status: string;
        timezone: string;
      }>(),
    supabase
      .from("event_summary_snapshots")
      .select("age_min,age_max,majority_intention,additional_languages")
      .eq("event_id", session.eventId)
      .eq("stage", "proposed")
      .maybeSingle<{
        additional_languages: string[];
        age_max: number | null;
        age_min: number | null;
        majority_intention: string | null;
      }>(),
    supabase
      .from("event_invitation_declines")
      .select("reason")
      .eq("invitation_id", session.invitationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ reason: string }>(),
  ]);
  if (!event) return null;

  const canApply =
    ["inviting", "confirmed"].includes(event.status) &&
    new Date(event.rsvp_deadline_at).getTime() > Date.now() &&
    !["declined", "expired"].includes(session.responseStatus) &&
    !["confirmed", "cancelled", "replaced"].includes(session.seatStatus);

  return {
    ok: true,
    event: {
      id: event.id,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      timezone: event.timezone,
      city: event.city,
      eventFormat: event.event_format,
      languageCode: event.language_code,
      capacity: event.capacity,
      ageRange: { min: summary?.age_min ?? null, max: summary?.age_max ?? null },
      majorityIntention: summary?.majority_intention || null,
      additionalLanguages: summary?.additional_languages || [],
      preferenceNudge: true,
      genderBalanceEnabled: event.gender_balance_enabled,
      rsvpDeadlineAt: event.rsvp_deadline_at,
      creditCost: event.credit_cost,
    },
    invitation: {
      declineReason: decline?.reason || null,
      responseStatus: session.responseStatus,
      seatStatus: session.seatStatus,
      paymentStatus: session.paymentStatus,
      waitlistReason: session.waitlistReason,
      priorityAt: session.priorityAt,
    },
    canApply,
    locale: session.locale,
  };
}

export async function getPublicPaymentResult(
  sessionToken: string,
  checkoutSessionId: string,
): Promise<PublicEventPaymentResult | null> {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "get_event_invitation_payment_result",
    {
      p_checkout_session_id: checkoutSessionId,
      p_session_token: sessionToken,
    },
  );
  if (error) return null;
  const result = data as PublicEventPaymentResult | null;
  return result?.eventId ? result : null;
}
