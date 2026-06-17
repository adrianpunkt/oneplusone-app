"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireMemberContext } from "@/lib/data/member";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localizeDbError } from "@/lib/i18n/errors";
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
  const { locale } = await requireMemberContext();
  const dictionary = getDictionary(locale);
  const invitationId = String(formData.get("invitation_id") || "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("confirm_event_invitation", {
    p_invitation_id: invitationId,
  });

  if (error) return { error: localizeDbError(error.message, dictionary) };

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
  const { locale, member } = await requireMemberContext();
  const dictionary = getDictionary(locale);
  const invitationId = String(formData.get("invitation_id") || "");
  const supabase = await createSupabaseServerClient();

  if (!invitationId) return { error: dictionary.actionErrors.invitationMissing };

  const { data: invitation, error: invitationError } = await supabase
    .from("event_invitations")
    .select("id,event_id,status,confirmed_at")
    .eq("id", invitationId)
    .eq("member_id", member.id)
    .maybeSingle<InvitationResponseLookup>();

  if (invitationError) return { error: localizeDbError(invitationError.message, dictionary) };
  if (!invitation) return { error: dictionary.actionErrors.invitationMissing };
  if (
    invitation.confirmed_at ||
    !["waitlisted", "declined", "cancelled"].includes(invitation.status)
  ) {
    return { error: dictionary.actionErrors.waitlistUnavailable };
  }

  let serviceClient: ReturnType<typeof getSupabaseServiceClient>;

  try {
    serviceClient = getSupabaseServiceClient();
  } catch {
    return { error: dictionary.actionErrors.eventResponsesNotConfigured };
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

  if (updateError) return { error: localizeDbError(updateError.message, dictionary) };
  if (!updatedInvitation)
    return { error: dictionary.actionErrors.waitlistUnavailable };

  revalidateEventMutationPaths(invitation.event_id);
  redirect("/going-out?waitlist=joined");
}

export async function declineInvitationAction(
  _previousState: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  const { locale, member } = await requireMemberContext();
  const dictionary = getDictionary(locale);
  const invitationId = String(formData.get("invitation_id") || "");
  const supabase = await createSupabaseServerClient();

  if (!invitationId) return { error: dictionary.actionErrors.invitationMissing };

  const { data: invitation, error: invitationError } = await supabase
    .from("event_invitations")
    .select("id,event_id,status,confirmed_at")
    .eq("id", invitationId)
    .eq("member_id", member.id)
    .maybeSingle<InvitationResponseLookup>();

  if (invitationError) return { error: localizeDbError(invitationError.message, dictionary) };
  if (!invitation) return { error: dictionary.actionErrors.invitationMissing };
  if (
    invitation.confirmed_at ||
    !["invited", "waitlisted"].includes(invitation.status)
  ) {
    return { error: dictionary.actionErrors.invitationDeclineUnavailable };
  }

  let serviceClient: ReturnType<typeof getSupabaseServiceClient>;

  try {
    serviceClient = getSupabaseServiceClient();
  } catch {
    return { error: dictionary.actionErrors.eventResponsesNotConfigured };
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

  if (updateError) return { error: localizeDbError(updateError.message, dictionary) };
  if (!updatedInvitation)
    return { error: dictionary.actionErrors.invitationDeclineUnavailable };

  revalidateEventMutationPaths(invitation.event_id);
  return { ok: true };
}

export async function cancelInvitationAction(
  _previousState: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  const { locale, member } = await requireMemberContext();
  const dictionary = getDictionary(locale);
  const invitationId = String(formData.get("invitation_id") || "");
  const supabase = await createSupabaseServerClient();

  if (!invitationId) return { error: dictionary.actionErrors.invitationMissing };

  const { data: invitation, error: invitationError } = await supabase
    .from("event_invitations")
    .select("id,event_id,status")
    .eq("id", invitationId)
    .eq("member_id", member.id)
    .maybeSingle<InvitationCancellationLookup>();

  if (invitationError) return { error: localizeDbError(invitationError.message, dictionary) };
  if (!invitation) return { error: dictionary.actionErrors.invitationMissing };

  if (invitation.status === "waitlisted") {
    let serviceClient: ReturnType<typeof getSupabaseServiceClient>;

    try {
      serviceClient = getSupabaseServiceClient();
    } catch {
      return { error: dictionary.actionErrors.eventCancellationsNotConfigured };
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

    if (updateError) return { error: localizeDbError(updateError.message, dictionary) };
    if (!cancelledInvitation)
      return { error: dictionary.actionErrors.invitationCancelUnavailable };

    revalidateEventMutationPaths(invitation.event_id);
    redirect("/going-out?waitlist=cancelled");
  }

  if (invitation.status !== "confirmed") {
    return {
      error: dictionary.actionErrors.confirmedOrWaitlistedOnly,
    };
  }

  const { error } = await supabase.rpc("cancel_event_confirmation", {
    p_invitation_id: invitationId,
  });

  if (error) return { error: localizeDbError(error.message, dictionary) };

  revalidateEventMutationPaths(invitation.event_id);
  return { ok: true };
}
