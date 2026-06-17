import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { z } from "zod";

import { getOptionalMemberContext } from "@/lib/data/member";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localizeText } from "@/lib/i18n/dynamic";
import { getRequestLocaleFallback } from "@/lib/i18n/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import type { CreditProduct } from "@/lib/types";

const payloadSchema = z.object({
  productId: z.string().uuid(),
});

export const runtime = "nodejs";

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

  const supabase = await createSupabaseServerClient();
  const { data: product, error } = await supabase
    .from("credit_products")
    .select("id,name,description,localized_content,credits,price_amount_cents,currency,stripe_price_id,status,sort_order")
    .eq("id", payload.data.productId)
    .eq("status", "active")
    .maybeSingle<CreditProduct>();

  if (error || !product) {
    return NextResponse.json({ ok: false, error: dictionary.checkout.productNotFound }, { status: 404 });
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
  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = product.stripe_price_id
    ? {
        price: product.stripe_price_id,
        quantity: 1,
      }
    : {
        quantity: 1,
        price_data: {
          currency: product.currency,
          unit_amount: product.price_amount_cents,
          product_data: {
            name: productName,
            description:
              productDescription ||
              dictionary.credits.attendEvents(product.credits),
          },
        },
      };

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      locale: context.locale,
      client_reference_id: context.member.id,
      customer_email: context.member.email || context.user.email || undefined,
      line_items: [lineItem],
      success_url: `${origin}/credits?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/credits?purchase=cancelled`,
      metadata: {
        purchase: "credit_pack",
        member_id: context.member.id,
        credit_product_id: product.id,
        credits: String(product.credits),
      },
      payment_intent_data: {
        metadata: {
          purchase: "credit_pack",
          member_id: context.member.id,
          credit_product_id: product.id,
          credits: String(product.credits),
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

  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (configuredUrl) {
    try {
      return new URL(configuredUrl).origin;
    } catch {
      console.error("Ignoring invalid NEXT_PUBLIC_APP_URL for Stripe Checkout");
    }
  }

  return requestOrigin;
}

function isLocalOrigin(origin: string) {
  const hostname = new URL(origin).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}
