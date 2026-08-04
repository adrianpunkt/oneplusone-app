import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { z } from "zod";

import { isLocalOrigin, resolveAppOrigin } from "@/lib/app-origin";
import { getOptionalMemberContext } from "@/lib/data/member";
import { getPostEventCreditOffer } from "@/lib/data/portal";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localizeText } from "@/lib/i18n/dynamic";
import { getRequestLocaleFallback } from "@/lib/i18n/server";
import {
  POST_EVENT_CREDIT_OFFER_PRODUCT_ID,
  postEventCheckoutExpiresAt,
} from "@/lib/post-event-credit-offer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import type { CreditProduct } from "@/lib/types";

const payloadSchema = z.object({
  productId: z.string().uuid(),
});

export const runtime = "nodejs";
const TAX_BEHAVIOR = "inclusive";

export async function POST(request: NextRequest) {
  const context = await getOptionalMemberContext();
  const dictionary = getDictionary(
    context?.locale || (await getRequestLocaleFallback()),
  );
  if (!context) {
    return NextResponse.json({ ok: false, error: dictionary.checkout.loginRequired }, { status: 401 });
  }

  const payload = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) {
    return NextResponse.json({ ok: false, error: dictionary.checkout.invalidProduct }, { status: 400 });
  }

  const isPostEventOffer =
    payload.data.productId === POST_EVENT_CREDIT_OFFER_PRODUCT_ID;
  const postEventOffer = isPostEventOffer
    ? await getPostEventCreditOffer()
    : null;
  let product: CreditProduct | null = postEventOffer?.product || null;

  if (!isPostEventOffer) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("credit_products")
      .select("id,name,description,localized_content,credits,price_amount_cents,currency,stripe_price_id,status,sort_order,offer_type")
      .eq("id", payload.data.productId)
      .eq("status", "active")
      .eq("offer_type", "standard")
      .maybeSingle<CreditProduct>();

    if (error) {
      return NextResponse.json(
        { ok: false, error: dictionary.checkout.productNotFound },
        { status: 404 },
      );
    }

    product = data;
  }

  if (!product) {
    return NextResponse.json(
      {
        ok: false,
        error: isPostEventOffer
          ? dictionary.checkout.postEventOfferUnavailable
          : dictionary.checkout.productNotFound,
      },
      { status: isPostEventOffer ? 410 : 404 },
    );
  }

  const checkoutExpiresAt = postEventOffer
    ? postEventCheckoutExpiresAt(postEventOffer.expiresAt)
    : null;
  if (postEventOffer && !checkoutExpiresAt) {
    return NextResponse.json(
      { ok: false, error: dictionary.checkout.postEventOfferUnavailable },
      { status: 410 },
    );
  }

  const origin = getCheckoutOrigin(request);
  const productName = localizeText(
    product.name,
    product.localized_content,
    context.locale,
    "name",
  );
  const productDescription = localizeText(
    product.description,
    product.localized_content,
    context.locale,
    "description",
  );
  const taxCode = normalizeStripeTaxCode(process.env.STRIPE_CREDIT_TAX_CODE);
  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = {
    quantity: 1,
    price_data: {
      currency: product.currency,
      unit_amount: product.price_amount_cents,
      tax_behavior: TAX_BEHAVIOR,
      product_data: {
        name: productName,
        description:
          productDescription ||
          dictionary.credits.attendEvents(product.credits),
        ...(taxCode ? { tax_code: taxCode } : {}),
      },
    },
  };

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      automatic_tax: { enabled: true },
      billing_address_collection: "auto",
      locale: context.locale,
      client_reference_id: context.member.id,
      customer_email: context.member.email || context.user.email || undefined,
      line_items: [lineItem],
      ...(checkoutExpiresAt ? { expires_at: checkoutExpiresAt } : {}),
      success_url: `${origin}/credits?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/credits?purchase=cancelled`,
      metadata: {
        purchase: "credit_pack",
        member_id: context.member.id,
        credit_product_id: product.id,
        credits: String(product.credits),
        offer_type: product.offer_type,
        ...(postEventOffer
          ? {
              offer_event_id: postEventOffer.eventId,
              offer_expires_at: postEventOffer.expiresAt,
            }
          : {}),
      },
      payment_intent_data: {
        metadata: {
          purchase: "credit_pack",
          member_id: context.member.id,
          credit_product_id: product.id,
          credits: String(product.credits),
          offer_type: product.offer_type,
          ...(postEventOffer
            ? {
                offer_event_id: postEventOffer.eventId,
                offer_expires_at: postEventOffer.expiresAt,
              }
            : {}),
        },
      },
    });

    if (!session.url) {
      return NextResponse.json({ ok: false, error: dictionary.checkout.couldNotStart }, { status: 502 });
    }

    return NextResponse.json({ ok: true, url: session.url });
  } catch (checkoutError) {
    console.error("Could not create credit checkout session", checkoutError);
    const paymentNotConfigured =
      checkoutError instanceof Error && checkoutError.message === "Missing STRIPE_SECRET_KEY.";
    return NextResponse.json(
      {
        ok: false,
        error: paymentNotConfigured
          ? dictionary.checkout.paymentNotConfigured
          : dictionary.checkout.couldNotStart,
      },
      { status: paymentNotConfigured ? 500 : 502 },
    );
  }
}

function getCheckoutOrigin(request: NextRequest) {
  const requestOrigin = request.nextUrl.origin;
  if (isLocalOrigin(requestOrigin)) return requestOrigin;

  return resolveAppOrigin(requestOrigin);
}

function normalizeStripeTaxCode(value: string | undefined) {
  return String(value || "").trim().replace(/\s+/g, "");
}
