import type Stripe from "stripe";

import { deliverMemberEventEmailFromResult } from "@/lib/event-email-delivery";
import { getSupabaseServiceClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import type { PublicEventPaymentResult } from "@/lib/types";

type EventMembershipSyncResult = {
  error?: string;
  result?: PublicEventPaymentResult;
  status: "completed" | "ignored" | "pending" | "failed";
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function completeEventMembershipPurchaseFromSession(
  session: Stripe.Checkout.Session,
  stripeEventId: string,
): Promise<EventMembershipSyncResult> {
  if (session.mode !== "payment" || session.metadata?.purchase !== "event_membership") {
    return { status: "ignored" };
  }
  if (session.payment_status !== "paid") return { status: "pending" };

  const paymentAttemptId = session.metadata.payment_attempt_id || "";
  const invitationId = session.metadata.invitation_id || "";
  const eventId = session.metadata.event_id || "";
  const memberId = session.metadata.member_id || "";
  if (
    !UUID_PATTERN.test(paymentAttemptId) ||
    !UUID_PATTERN.test(invitationId) ||
    !UUID_PATTERN.test(eventId) ||
    !UUID_PATTERN.test(memberId) ||
    !session.id ||
    !stripeEventId
  ) {
    return { status: "failed", error: "Invalid event checkout metadata." };
  }

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.rpc("complete_event_invitation_payment", {
    p_checkout_session_id: session.id,
    p_payment_attempt_id: paymentAttemptId,
    p_payment_intent_id:
      typeof session.payment_intent === "string" ? session.payment_intent : null,
    p_stripe_event_id: stripeEventId,
  });
  if (error) return { status: "failed", error: error.message };

  const internal = data as {
    creditAvailable?: boolean;
    eventId?: string;
    paymentStatus?: PublicEventPaymentResult["paymentStatus"];
    seatStatus?: PublicEventPaymentResult["seatStatus"];
    status?: PublicEventPaymentResult["status"];
    waitlistReason?: PublicEventPaymentResult["waitlistReason"];
  } | null;
  if (!internal?.eventId || internal.eventId !== eventId) {
    return { status: "failed", error: "Event checkout reconciliation failed." };
  }
  await deliverMemberEventEmailFromResult(data);

  return {
    result: {
      ok: true,
      status: internal.status || "payment_pending",
      eventId: internal.eventId,
      seatStatus: internal.seatStatus || "none",
      paymentStatus: internal.paymentStatus || "pending",
      waitlistReason: internal.waitlistReason || null,
      creditAvailable: Boolean(internal.creditAvailable),
      loginNext: `/events/${internal.eventId}`,
    },
    status: "completed",
  };
}

export async function reconcileEventMembershipCheckout(
  checkoutSessionId: string,
  expectedInvitationId: string,
): Promise<EventMembershipSyncResult> {
  const cleanSessionId = checkoutSessionId.trim();
  if (!cleanSessionId.startsWith("cs_")) {
    return { status: "failed", error: "Invalid checkout session." };
  }

  try {
    const session = await getStripe().checkout.sessions.retrieve(cleanSessionId);
    if (session.metadata?.invitation_id !== expectedInvitationId) {
      return { status: "failed", error: "Checkout session does not belong to this invitation." };
    }
    return completeEventMembershipPurchaseFromSession(
      session,
      `success:${session.id}`,
    );
  } catch {
    return { status: "failed", error: "Could not verify the checkout session." };
  }
}
