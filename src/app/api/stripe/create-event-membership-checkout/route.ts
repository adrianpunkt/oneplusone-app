import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";

import { getRuntimeEnv } from "@/lib/env";
import {
  eventInvitationSessionCookie,
  resolveInternalInvitationSession,
} from "@/lib/event-invitations";
import { isLocalOrigin, resolveAppOrigin } from "@/lib/app-origin";
import { getStripe } from "@/lib/stripe";
import { getSupabaseServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MEMBERSHIP_AMOUNT_CENTS = 1500;
const MEMBERSHIP_CURRENCY = "eur";

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get(eventInvitationSessionCookie)?.value || "";
  const invitationSession = await resolveInternalInvitationSession(sessionToken);
  if (!invitationSession) {
    return NextResponse.json({ ok: false, error: "Invitation session expired." }, { status: 401 });
  }

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.rpc("begin_event_invitation_payment", {
    p_idempotency_key: `event-membership-${invitationSession.invitationId}-${invitationSession.sessionId}`,
    p_session_token: sessionToken,
  });
  const payment = data as {
    email?: string;
    eventId?: string;
    holdId?: string | null;
    invitationId?: string;
    locale?: "en" | "es";
    memberId?: string;
    paymentAttemptId?: string | null;
    status?: "checkout_required" | "confirmed" | "waitlisted" | "closed";
  } | null;
  if (error || !payment?.status) {
    return NextResponse.json({ ok: false, error: "Could not prepare event checkout." }, { status: 409 });
  }
  if (payment.status !== "checkout_required" || !payment.paymentAttemptId) {
    return NextResponse.json({ ok: true, status: payment.status });
  }

  const { data: existingAttempt } = await supabase
    .from("event_invitation_payment_attempts")
    .select("stripe_checkout_session_id")
    .eq("id", payment.paymentAttemptId)
    .maybeSingle<{ stripe_checkout_session_id: string | null }>();

  try {
    if (existingAttempt?.stripe_checkout_session_id) {
      const existingSession = await getStripe().checkout.sessions.retrieve(
        existingAttempt.stripe_checkout_session_id,
      );
      if (existingSession.url && existingSession.status === "open") {
        return NextResponse.json({ ok: true, status: "checkout_required", url: existingSession.url });
      }
    }

    const origin = checkoutOrigin(request);
    const priceId = getRuntimeEnv("STRIPE_MEMBERSHIP_PRICE_ID")?.trim();
    const taxCode = normalizeStripeTaxCode(getRuntimeEnv("STRIPE_MEMBERSHIP_TAX_CODE"));
    const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = priceId
      ? { price: priceId, quantity: 1 }
      : {
          quantity: 1,
          price_data: {
            currency: MEMBERSHIP_CURRENCY,
            unit_amount: MEMBERSHIP_AMOUNT_CENTS,
            tax_behavior: "inclusive",
            product_data: {
              name: "one plus one club membership",
              description: "One-time membership fee with one joining credit",
              ...(taxCode ? { tax_code: taxCode } : {}),
            },
          },
        };
    const metadata = {
      purchase: "event_membership",
      event_id: payment.eventId || invitationSession.eventId,
      invitation_id: payment.invitationId || invitationSession.invitationId,
      hold_id: payment.holdId || "",
      member_id: payment.memberId || invitationSession.memberId,
      payment_attempt_id: payment.paymentAttemptId,
    };
    const checkout = await getStripe().checkout.sessions.create(
      {
        mode: "payment",
        automatic_tax: { enabled: true },
        billing_address_collection: "auto",
        client_reference_id: invitationSession.memberId,
        customer_email: payment.email || invitationSession.email,
        line_items: [lineItem],
        locale: payment.locale || invitationSession.locale,
        success_url: `${origin}/event-invitation?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/event-invitation?payment=cancelled`,
        metadata,
        payment_intent_data: { metadata },
      },
      { idempotencyKey: `event-membership-checkout-${payment.paymentAttemptId}` },
    );
    if (!checkout.url) {
      return NextResponse.json({ ok: false, error: "Checkout did not return a URL." }, { status: 502 });
    }

    const { error: attachError } = await supabase.rpc("attach_event_checkout_session", {
      p_checkout_session_id: checkout.id,
      p_payment_attempt_id: payment.paymentAttemptId,
    });
    if (attachError) {
      return NextResponse.json({ ok: false, error: "Could not attach event checkout." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, status: "checkout_required", url: checkout.url });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not start event checkout." }, { status: 502 });
  }
}

function checkoutOrigin(request: NextRequest) {
  return isLocalOrigin(request.nextUrl.origin)
    ? request.nextUrl.origin
    : resolveAppOrigin(request.nextUrl.origin);
}

function normalizeStripeTaxCode(value: string | undefined) {
  return String(value || "").trim().replace(/\s+/g, "");
}
