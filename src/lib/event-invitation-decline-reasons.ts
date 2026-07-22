export const eventInvitationDeclineReasons = [
  "weekend_unavailable",
  "prefers_saturday_dinner",
  "prefers_sunday_brunch",
  "event_fit",
  "other_commitment",
] as const;

export const pendingEventInvitationDeclineReasons = [
  "event_type_not_interested",
  ...eventInvitationDeclineReasons,
] as const;

export type EventInvitationDeclineReason =
  (typeof eventInvitationDeclineReasons)[number];
export type EventInvitationFormat = "brunch" | "dinner" | "other";

const declineReasonSet = new Set<string>(eventInvitationDeclineReasons);

export function eventInvitationAlternativeDeclineReason(
  eventFormat: EventInvitationFormat,
): Extract<
  EventInvitationDeclineReason,
  "prefers_saturday_dinner" | "prefers_sunday_brunch"
> | null {
  if (eventFormat === "brunch") return "prefers_saturday_dinner";
  if (eventFormat === "dinner") return "prefers_sunday_brunch";
  return null;
}

export function isEventInvitationDeclineReason(
  value: string,
): value is EventInvitationDeclineReason {
  return declineReasonSet.has(value);
}

export function isEventInvitationDeclineReasonForFormat(
  value: string,
  eventFormat: EventInvitationFormat,
) {
  if (!isEventInvitationDeclineReason(value)) return false;
  if (
    value !== "prefers_saturday_dinner"
    && value !== "prefers_sunday_brunch"
  ) return true;

  return value === eventInvitationAlternativeDeclineReason(eventFormat);
}
