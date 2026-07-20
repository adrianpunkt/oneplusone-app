import type { EventInvitation, EventRecord } from "@/lib/types";

type ClassifiableInvitation = Pick<
  EventInvitation,
  "responded_at" | "status"
>;

type ReapplicableInvitation = Pick<
  EventInvitation,
  "response_mode" | "status"
>;

type RestorableInvitation = Pick<
  EventInvitation,
  "confirmed_at" | "replacement_found" | "status"
> & {
  events?: Pick<EventRecord, "rsvp_deadline_at" | "status"> | null;
};

export function isPendingInvitation(invitation: ClassifiableInvitation) {
  if (invitation.status === "invited") return true;
  return invitation.status === "waitlisted" && !invitation.responded_at;
}

export function isRejectedInvitation(invitation: ClassifiableInvitation) {
  return ["cancelled", "declined", "expired"].includes(invitation.status);
}

export function canReapplyDeclinedInvitation(
  invitation: ReapplicableInvitation,
) {
  return invitation.status === "declined" &&
    invitation.response_mode !== undefined &&
    invitation.response_mode !== "closed";
}

export function shouldShowCannotMakeItStatus(
  invitationStatus: EventInvitation["status"],
  eventStatus: EventRecord["status"] | undefined,
) {
  return invitationStatus === "declined" ||
    (invitationStatus === "cancelled" && eventStatus !== "cancelled");
}

export function canRestoreCancelledInvitation(
  invitation: RestorableInvitation,
  now: number,
) {
  if (
    invitation.status !== "cancelled" ||
    !invitation.confirmed_at ||
    invitation.replacement_found
  ) {
    return false;
  }

  if (
    !invitation.events ||
    !["inviting", "confirmed"].includes(invitation.events.status)
  ) {
    return false;
  }

  const deadline = new Date(invitation.events.rsvp_deadline_at).getTime();
  return !Number.isNaN(deadline) && now < deadline;
}
