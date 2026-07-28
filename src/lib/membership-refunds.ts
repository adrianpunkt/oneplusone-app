import type Stripe from "stripe";

import {
  isManagedMembershipRefundEventType,
  isMembershipRefundRecordId,
  normalizeMembershipRefundStatus,
} from "@/lib/membership-refund-events";
import { getStripe } from "@/lib/stripe";
import { getSupabaseServiceClient } from "@/lib/supabase/admin";

export function isManagedMembershipRefundEvent(event: Stripe.Event) {
  return isManagedMembershipRefundEventType(event.type);
}

export async function syncMembershipRefundFromWebhook(event: Stripe.Event) {
  if (!isManagedMembershipRefundEvent(event)) return { ignored: true as const };

  const eventRefund = event.data.object as Stripe.Refund;
  if (
    eventRefund.metadata?.source !== "ops_membership_refund"
    || !isMembershipRefundRecordId(eventRefund.metadata?.ops_refund_id)
  ) {
    return { ignored: true as const };
  }

  const refund = await getStripe().refunds.retrieve(eventRefund.id);
  const refundId = refund.metadata?.ops_refund_id;
  if (
    refund.metadata?.source !== "ops_membership_refund"
    || !isMembershipRefundRecordId(refundId)
  ) {
    return { ignored: true as const };
  }

  const status = normalizeMembershipRefundStatus(refund.status);
  const { data, error } = await getSupabaseServiceClient().rpc("sync_membership_refund", {
    p_failure_reason: refund.failure_reason || (refund.status ? null : "missing_refund_status"),
    p_pending_reason: refund.pending_reason || null,
    p_refund_id: refundId,
    p_request_error: null,
    p_status: status,
    p_stripe_created_at: new Date(refund.created * 1000).toISOString(),
    p_stripe_refund_id: refund.id,
  });

  if (error) throw new Error(error.message);
  return { ignored: false as const, result: data };
}
