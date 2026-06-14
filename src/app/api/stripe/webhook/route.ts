import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";

import { getSupabaseServiceClient } from "@/lib/supabase/admin";
import { getStripe, getStripeWebhookSecret } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  const webhookSecret = getStripeWebhookSecret();
  if (!webhookSecret) {
    return NextResponse.json({ ok: false, error: "Webhook is not configured." }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ ok: false, error: "Missing Stripe signature." }, { status: 400 });
  }

  const payload = await request.text();
  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(payload, signature, webhookSecret);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid Stripe signature." }, { status: 400 });
  }

  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  ) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.mode !== "payment" || session.metadata?.purchase !== "credit_pack") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (event.type === "checkout.session.completed" && session.payment_status !== "paid") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const memberId = session.metadata.member_id;
  const productId = session.metadata.credit_product_id;
  if (!memberId || !productId || !session.id) {
    return NextResponse.json({ ok: false, error: "Missing credit metadata." }, { status: 400 });
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
    console.error("Could not complete credit pack purchase", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, result: data });
}
