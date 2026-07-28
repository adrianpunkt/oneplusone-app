export const managedMembershipRefundEventTypes = [
  "refund.created",
  "refund.updated",
  "refund.failed",
] as const;

export function isManagedMembershipRefundEventType(type: string) {
  return managedMembershipRefundEventTypes.includes(
    type as (typeof managedMembershipRefundEventTypes)[number],
  );
}

export function normalizeMembershipRefundStatus(status: string | null) {
  return status || "failed";
}

export function isMembershipRefundRecordId(value: string | null | undefined) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value || "");
}
