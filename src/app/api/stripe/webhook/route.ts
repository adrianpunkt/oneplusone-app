import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";

import { completeCreditPackPurchaseFromSession } from "@/lib/credit-purchases";
import {
  getStripe,
  getStripeWebhookCryptoProvider,
  getStripeWebhookSecret,
} from "@/lib/stripe";

export const runtime = "nodejs";

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
    event = await getStripe().webhooks.constructEventAsync(
      payload,
      signature,
      webhookSecret,
      undefined,
      getStripeWebhookCryptoProvider(),
    );
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid Stripe signature." }, { status: 400 });
  }

  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  ) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const result = await completeCreditPackPurchaseFromSession(
    event.data.object as Stripe.Checkout.Session,
  );

  if (result.status === "failed") {
    console.error("Could not complete credit pack purchase", result.error);
    return NextResponse.json(
      { ok: false, error: result.error || "Could not complete credit pack purchase." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, result });
}
