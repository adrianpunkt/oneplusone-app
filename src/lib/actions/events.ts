"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireMemberContext } from "@/lib/data/member";
import { getSupabaseServiceClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EventInvitation } from "@/lib/types";

export type EventActionState = {
  error?: string;
  ok?: boolean;
};

type InvitationCancellationLookup = Pick<
  EventInvitation,
  "event_id" | "id" | "status"
>;
type InvitationResponseLookup = Pick<
  EventInvitation,
  "confirmed_at" | "event_id" | "id" | "status"
>;

function revalidateEventMutationPaths(eventId?: string) {
  revalidatePath("/events");
  revalidatePath("/going-out");
  revalidatePath("/dashboard");
  if (eventId) revalidatePath(`/events/${eventId}`);
}

export async function confirmInvitationAction(
  _previousState: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  await requireMemberContext();
  const invitationId = String(formData.get("invitation_id") || "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("confirm_event_invitation", {
    p_invitation_id: invitationId,
  });

  if (error) return { error: error.message };

  revalidatePath("/events");
  revalidatePath("/going-out");
  revalidatePath("/credits");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function joinWaitlistAction(
  _previousState: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  const { member } = await requireMemberContext();
  const invitationId = String(formData.get("invitation_id") || "");
  const supabase = await createSupabaseServerClient();

  if (!invitationId) return { error: "Invitation was not found." };

  const { data: invitation, error: invitationError } = await supabase
    .from("event_invitations")
    .select("id,event_id,status,confirmed_at")
    .eq("id", invitationId)
    .eq("member_id", member.id)
    .maybeSingle<InvitationResponseLookup>();

  if (invitationError) return { error: invitationError.message };
  if (!invitation) return { error: "Invitation was not found." };
  if (
    invitation.confirmed_at ||
    !["waitlisted", "declined", "cancelled"].includes(invitation.status)
  ) {
    return { error: "This waitlist is no longer available." };
  }

  let serviceClient: ReturnType<typeof getSupabaseServiceClient>;

  try {
    serviceClient = getSupabaseServiceClient();
  } catch {
    return { error: "Event responses are not configured yet." };
  }

  const now = new Date().toISOString();
  const { data: updatedInvitation, error: updateError } = await serviceClient
    .from("event_invitations")
    .update({
      cancelled_at: null,
      responded_at: now,
      status: "waitlisted",
      updated_at: now,
    })
    .eq("id", invitation.id)
    .eq("member_id", member.id)
    .is("confirmed_at", null)
    .in("status", ["waitlisted", "declined", "cancelled"])
    .select("id")
    .maybeSingle<{ id: string }>();

  if (updateError) return { error: updateError.message };
  if (!updatedInvitation)
    return { error: "This waitlist is no longer available." };

  revalidateEventMutationPaths(invitation.event_id);
  redirect("/going-out?waitlist=joined");
}

export async function declineInvitationAction(
  _previousState: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  const { member } = await requireMemberContext();
  const invitationId = String(formData.get("invitation_id") || "");
  const supabase = await createSupabaseServerClient();

  if (!invitationId) return { error: "Invitation was not found." };

  const { data: invitation, error: invitationError } = await supabase
    .from("event_invitations")
    .select("id,event_id,status,confirmed_at")
    .eq("id", invitationId)
    .eq("member_id", member.id)
    .maybeSingle<InvitationResponseLookup>();

  if (invitationError) return { error: invitationError.message };
  if (!invitation) return { error: "Invitation was not found." };
  if (
    invitation.confirmed_at ||
    !["invited", "waitlisted"].includes(invitation.status)
  ) {
    return { error: "This invitation can no longer be declined here." };
  }

  let serviceClient: ReturnType<typeof getSupabaseServiceClient>;

  try {
    serviceClient = getSupabaseServiceClient();
  } catch {
    return { error: "Event responses are not configured yet." };
  }

  const now = new Date().toISOString();
  const { data: updatedInvitation, error: updateError } = await serviceClient
    .from("event_invitations")
    .update({
      cancelled_at: null,
      responded_at: now,
      status: "declined",
      updated_at: now,
    })
    .eq("id", invitation.id)
    .eq("member_id", member.id)
    .is("confirmed_at", null)
    .in("status", ["invited", "waitlisted"])
    .select("id")
    .maybeSingle<{ id: string }>();

  if (updateError) return { error: updateError.message };
  if (!updatedInvitation)
    return { error: "This invitation can no longer be declined here." };

  revalidateEventMutationPaths(invitation.event_id);
  return { ok: true };
}

export async function cancelInvitationAction(
  _previousState: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  const { member } = await requireMemberContext();
  const invitationId = String(formData.get("invitation_id") || "");
  const supabase = await createSupabaseServerClient();

  if (!invitationId) return { error: "Invitation was not found." };

  const { data: invitation, error: invitationError } = await supabase
    .from("event_invitations")
    .select("id,event_id,status")
    .eq("id", invitationId)
    .eq("member_id", member.id)
    .maybeSingle<InvitationCancellationLookup>();

  if (invitationError) return { error: invitationError.message };
  if (!invitation) return { error: "Invitation was not found." };

  if (invitation.status === "waitlisted") {
    let serviceClient: ReturnType<typeof getSupabaseServiceClient>;

    try {
      serviceClient = getSupabaseServiceClient();
    } catch {
      return { error: "Event cancellations are not configured yet." };
    }

    const now = new Date().toISOString();
    const { data: cancelledInvitation, error: updateError } =
      await serviceClient
        .from("event_invitations")
        .update({
          cancelled_at: null,
          responded_at: now,
          status: "declined",
          updated_at: now,
        })
        .eq("id", invitation.id)
        .eq("member_id", member.id)
        .eq("status", "waitlisted")
        .select("id")
        .maybeSingle<{ id: string }>();

    if (updateError) return { error: updateError.message };
    if (!cancelledInvitation)
      return { error: "This invitation can no longer be cancelled." };

    revalidateEventMutationPaths(invitation.event_id);
    redirect("/going-out?waitlist=cancelled");
  }

  if (invitation.status !== "confirmed") {
    return {
      error: "Only confirmed or waitlisted invitations can be cancelled here.",
    };
  }

  const { error } = await supabase.rpc("cancel_event_confirmation", {
    p_invitation_id: invitationId,
  });

  if (error) return { error: error.message };

  revalidateEventMutationPaths(invitation.event_id);
  return { ok: true };
}
