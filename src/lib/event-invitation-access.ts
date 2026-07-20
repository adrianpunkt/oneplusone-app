import "server-only";

import { deliverMemberEventEmail } from "@/lib/event-email-delivery";
import { getSupabaseServiceClient } from "@/lib/supabase/admin";
import type {
  InvitationResponseStatus,
  InvitationSeatStatus,
} from "@/lib/types";

export type EventInvitationAccessStatus =
  | "deadline"
  | "invalid"
  | "resent"
  | "retry"
  | "unavailable"
  | "valid";

export async function preflightEventInvitationAccess(
  token: string,
): Promise<EventInvitationAccessStatus> {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "refresh_expired_event_invitation_link",
    { p_token: token },
  );
  const refresh = data as {
    deliveryId?: string;
    ok?: boolean;
    status?: string;
  } | null;

  if (error) return "retry";
  if (refresh?.status === "invalid") return "invalid";
  if (refresh?.status === "valid") return "valid";
  if (refresh?.status === "deadline_passed") return "deadline";
  if (refresh?.status === "unavailable") return "unavailable";
  if (refresh?.ok && refresh.status === "already_sent") return "resent";
  if (!refresh?.ok || !refresh.deliveryId) return "unavailable";

  const delivery = await deliverMemberEventEmail(refresh.deliveryId);
  return delivery.ok ? "resent" : "retry";
}

export async function resolveActiveMemberEventInvitationAccess(token: string) {
  if (!token.trim()) return null;

  const supabase = getSupabaseServiceClient();
  const tokenHash = await sha256(token);
  const { data: accessToken, error: accessTokenError } = await supabase
    .from("event_invitation_access_tokens")
    .select("invitation_id")
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle<{ invitation_id: string }>();

  if (accessTokenError || !accessToken) return null;

  const { data: invitation, error: invitationError } = await supabase
    .from("event_invitations")
    .select("member_id,response_status,seat_status")
    .eq("id", accessToken.invitation_id)
    .maybeSingle<{
      member_id: string;
      response_status: InvitationResponseStatus;
      seat_status: InvitationSeatStatus;
    }>();

  if (invitationError || !invitation) return null;

  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("email,membership_status,preferred_locale")
    .eq("id", invitation.member_id)
    .maybeSingle<{
      email: string;
      membership_status: string;
      preferred_locale: string | null;
    }>();

  if (memberError || member?.membership_status !== "active" || !member.email) return null;
  return {
    email: member.email,
    invitationId: accessToken.invitation_id,
    locale: member.preferred_locale === "es" ? "es" as const : "en" as const,
    memberId: invitation.member_id,
    responseStatus: invitation.response_status,
    seatStatus: invitation.seat_status,
  };
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
