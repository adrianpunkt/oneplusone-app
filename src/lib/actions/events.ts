"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireMemberContext } from "@/lib/data/member";
import { isEventCancellationReason } from "@/lib/event-cancellation";
import { deliverMemberEventEmailFromResult } from "@/lib/event-email-delivery";
import { isEventInvitationDeclineReason } from "@/lib/event-invitation-decline-reasons";
import { waitlistConfirmationParam } from "@/lib/event-waitlist";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localizeDbError } from "@/lib/i18n/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EventInvitation } from "@/lib/types";

export type EventActionState = {
  confirmationStatus?: "confirmed" | "waitlisted";
  error?: string;
  ok?: boolean;
};

export type EventFeedbackActionState = { error?: string; ok?: boolean };

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
  const { locale, member } = await requireMemberContext();
  const dictionary = getDictionary(locale);
  const invitationId = String(formData.get("invitation_id") || "");
  const supabase = await createSupabaseServerClient();

  if (!invitationId) return { error: dictionary.actionErrors.invitationMissing };

  if (formData.has("wants_to_host")) {
    const wantsToHost = formData.get("wants_to_host") === "true";
    const { error: preferenceError } = await supabase
      .from("member_event_preferences")
      .upsert({
        member_id: member.id,
        wants_to_host: wantsToHost,
        updated_at: new Date().toISOString(),
      });

    if (preferenceError) {
      return {
        error: localizeDbError(preferenceError.message, dictionary),
      };
    }
  }

  const { data, error } = await supabase.rpc("confirm_event_invitation", {
    p_invitation_id: invitationId,
  });

  if (error) return { error: localizeDbError(error.message, dictionary) };

  revalidatePath("/events");
  revalidatePath("/going-out");
  revalidatePath("/credits");
  revalidatePath("/dashboard");
  revalidatePath("/preferences");
  const result = data as {
    seatStatus?: "confirmed" | "waitlisted";
    waitlistReason?: "balance" | "capacity" | "payment_hold_expired" | null;
  } | null;
  await deliverMemberEventEmailFromResult(data);

  if (result?.seatStatus === "waitlisted") {
    redirect(`/going-out?waitlist=${waitlistConfirmationParam(result.waitlistReason)}`);
  }

  return {
    confirmationStatus: "confirmed",
    ok: true,
  };
}

export async function restoreInvitationAction(
  _previousState: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  const { locale, member } = await requireMemberContext();
  const dictionary = getDictionary(locale);
  const invitationId = String(formData.get("invitation_id") || "");

  if (!invitationId) return { error: dictionary.actionErrors.invitationMissing };

  const supabase = await createSupabaseServerClient();

  if (formData.has("wants_to_host")) {
    const wantsToHost = formData.get("wants_to_host") === "true";
    const { error: preferenceError } = await supabase
      .from("member_event_preferences")
      .upsert({
        member_id: member.id,
        wants_to_host: wantsToHost,
        updated_at: new Date().toISOString(),
      });

    if (preferenceError) {
      return {
        error: localizeDbError(preferenceError.message, dictionary),
      };
    }
  }

  const { data, error } = await supabase.rpc(
    "restore_cancelled_event_confirmation",
    { p_invitation_id: invitationId },
  );

  if (error) return { error: localizeDbError(error.message, dictionary) };
  await deliverMemberEventEmailFromResult(data);

  revalidatePath("/events");
  revalidatePath("/going-out");
  revalidatePath("/credits");
  revalidatePath("/dashboard");
  revalidatePath("/preferences");
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
  const { data, error } = await supabase.rpc("join_event_waitlist", {
    p_invitation_id: invitation.id,
  });

  if (error) return { error: localizeDbError(error.message, dictionary) };
  await deliverMemberEventEmailFromResult(data);

  revalidateEventMutationPaths(invitation.event_id);
  const result = data as { waitlistReason?: string | null } | null;
  redirect(`/going-out?waitlist=${waitlistConfirmationParam(result?.waitlistReason)}`);
}

export async function declineInvitationAction(
  _previousState: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  const { locale } = await requireMemberContext();
  const dictionary = getDictionary(locale);
  const invitationId = String(formData.get("invitation_id") || "");
  const declineReason = String(formData.get("decline_reason") || "").trim();
  const declineDetails = String(formData.get("decline_details") || "").trim();
  const supabase = await createSupabaseServerClient();

  if (!invitationId) return { error: dictionary.actionErrors.invitationMissing };
  if (!isEventInvitationDeclineReason(declineReason)) {
    return { error: dictionary.actionErrors.invitationDeclineReasonRequired };
  }
  if (declineDetails.length > 500) {
    return { error: dictionary.actionErrors.invitationDeclineDetailsTooLong };
  }

  const { data, error } = await supabase.rpc("decline_event_invitation", {
    p_details: declineDetails || null,
    p_invitation_id: invitationId,
    p_reason: declineReason,
  });

  if (error) return { error: localizeDbError(error.message, dictionary) };

  await deliverMemberEventEmailFromResult(data);
  const result = data as { eventId?: string } | null;
  revalidateEventMutationPaths(result?.eventId);
  return { ok: true };
}

export async function cancelInvitationAction(
  _previousState: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  const { locale, member } = await requireMemberContext();
  const dictionary = getDictionary(locale);
  const invitationId = String(formData.get("invitation_id") || "");
  const cancellationReason = String(formData.get("cancellation_reason") || "").trim();
  const cancellationDetails = String(formData.get("cancellation_details") || "").trim();
  const supabase = await createSupabaseServerClient();

  if (!invitationId) return { error: dictionary.actionErrors.invitationMissing };
  if (!isEventCancellationReason(cancellationReason)) {
    return { error: dictionary.actionErrors.invitationCancellationReasonRequired };
  }
  if (cancellationDetails.length > 500) {
    return { error: dictionary.actionErrors.invitationCancellationDetailsTooLong };
  }

  const { data: invitation, error: invitationError } = await supabase
    .from("event_invitations")
    .select("id,event_id,status")
    .eq("id", invitationId)
    .eq("member_id", member.id)
    .maybeSingle<InvitationCancellationLookup>();

  if (invitationError) return { error: localizeDbError(invitationError.message, dictionary) };
  if (!invitation) return { error: dictionary.actionErrors.invitationMissing };

  if (invitation.status !== "confirmed" && invitation.status !== "waitlisted") {
    return {
      error: dictionary.actionErrors.confirmedOrWaitlistedOnly,
    };
  }

  const { data, error } = await supabase.rpc("cancel_event_confirmation", {
    p_details: cancellationDetails || null,
    p_invitation_id: invitationId,
    p_reason: cancellationReason,
  });

  if (error) return { error: localizeDbError(error.message, dictionary) };

  await deliverMemberEventEmailFromResult(data);
  revalidateEventMutationPaths(invitation.event_id);
  const result = data as { seatStatus?: string } | null;
  if (invitation.status === "waitlisted" || result?.seatStatus === "none") {
    redirect("/going-out?waitlist=cancelled");
  }
  return { ok: true };
}

export async function submitEventFeedbackAction(
  _previousState: EventFeedbackActionState,
  formData: FormData,
): Promise<EventFeedbackActionState> {
  const { locale } = await requireMemberContext();
  const dictionary = getDictionary(locale);
  const eventId = String(formData.get("event_id") || "");
  const rating = (name: string) => {
    const value = Number(formData.get(name));
    return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
  };
  const ratings = {
    host: rating("host_rating"),
    hosting: rating("hosting_experience_rating"),
    overall: rating("overall_rating"),
    questions: rating("questions_rating"),
    restaurant: rating("restaurant_rating"),
  };
  const oneStarDetail = String(formData.get("one_star_detail") || "").trim();
  if (!eventId || !Object.values(ratings).some((value) => value !== null)) {
    return { error: locale === "es" ? "Añade al menos una valoración." : "Add at least one rating." };
  }
  if (Object.values(ratings).includes(1) && !oneStarDetail) {
    return { error: locale === "es" ? "Cuéntanos qué ocurrió con la valoración de una estrella." : "Tell us what happened for any one-star rating." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_event_feedback", {
    p_comments: String(formData.get("comments") || "").trim() || null,
    p_event_id: eventId,
    p_host_rating: ratings.host,
    p_hosting_experience_rating: ratings.hosting,
    p_one_star_detail: oneStarDetail || null,
    p_overall_rating: ratings.overall,
    p_questions_rating: ratings.questions,
    p_restaurant_rating: ratings.restaurant,
  });
  if (error) return { error: localizeDbError(error.message, dictionary) };
  revalidateEventMutationPaths(eventId);
  return { ok: true };
}
