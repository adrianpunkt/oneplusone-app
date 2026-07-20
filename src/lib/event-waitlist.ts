import type { InvitationWaitlistReason } from "@/lib/types";

export type WaitlistConfirmationStatus =
  | "balance"
  | "capacity"
  | "payment-hold-expired"
  | "cancelled";

export function waitlistConfirmationParam(
  reason: InvitationWaitlistReason | string | null | undefined,
): Exclude<WaitlistConfirmationStatus, "cancelled"> {
  if (reason === "balance") return "balance";
  if (reason === "payment_hold_expired") return "payment-hold-expired";
  return "capacity";
}

export function parseWaitlistConfirmationStatus(
  value: string | string[] | undefined,
): WaitlistConfirmationStatus | null {
  const status = Array.isArray(value) ? value[0] : value;

  if (status === "joined") return "capacity";
  if (
    status === "balance" ||
    status === "capacity" ||
    status === "payment-hold-expired" ||
    status === "cancelled"
  ) {
    return status;
  }

  return null;
}
