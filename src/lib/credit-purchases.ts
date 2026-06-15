import type Stripe from "stripe";

import { getSupabaseServiceClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

export type CreditCheckoutSyncResult = {
  credits?: number;
  error?: string;
  status: "completed" | "ignored" | "pending" | "failed";
};

export async function completeCreditPackPurchaseFromSession(
  session: Stripe.Checkout.Session,
): Promise<CreditCheckoutSyncResult> {
  if (session.mode !== "payment" || session.metadata?.purchase !== "credit_pack") {
    return { status: "ignored" };
  }

  if (session.payment_status !== "paid") {
    return { status: "pending" };
  }

  const memberId = session.metadata.member_id;
  const productId = session.metadata.credit_product_id;
  if (!memberId || !productId || !session.id) {
    return { status: "failed", error: "Missing credit checkout metadata." };
  }

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.rpc("complete_credit_pack_purchase", {
    p_member_id: memberId,
    p_credit_product_id: productId,
    p_checkout_session_id: session.id,
    p_payment_intent_id:
      typeof session.payment_intent === "string" ? session.payment_intent : null,
  });

  if (error) {
    return { status: "failed", error: error.message };
  }

  const result = data as { credits?: number } | null;
  return {
    credits: result?.credits ?? Number(session.metadata.credits || 0),
    status: "completed",
  };
}

export async function syncCreditCheckoutSessionForMember(
  sessionId: string | null | undefined,
  memberId: string,
): Promise<CreditCheckoutSyncResult> {
  const cleanSessionId = String(sessionId || "").trim();
  if (!cleanSessionId.startsWith("cs_")) {
    return { status: "failed", error: "Missing checkout session." };
  }

  try {
    const session = await getStripe().checkout.sessions.retrieve(cleanSessionId);
    if (session.metadata?.member_id !== memberId) {
      return { status: "failed", error: "Checkout session does not belong to this member." };
    }

    return completeCreditPackPurchaseFromSession(session);
  } catch (error) {
    console.error("Could not sync credit checkout session", error);
    return { status: "failed", error: "Could not verify the checkout session." };
  }
}
