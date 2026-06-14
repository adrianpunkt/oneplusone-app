import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getOptionalMemberContext } from "@/lib/data/member";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import type { CreditProduct } from "@/lib/types";

const payloadSchema = z.object({
  productId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const context = await getOptionalMemberContext();
  if (!context) {
    return NextResponse.json({ ok: false, error: "Login required." }, { status: 401 });
  }

  const payload = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) {
    return NextResponse.json({ ok: false, error: "Invalid credit product." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: product, error } = await supabase
    .from("credit_products")
    .select("id,name,description,credits,price_amount_cents,currency,stripe_price_id,status,sort_order")
    .eq("id", payload.data.productId)
    .eq("status", "active")
    .maybeSingle<CreditProduct>();

  if (error || !product) {
    return NextResponse.json({ ok: false, error: "Credit product was not found." }, { status: 404 });
  }

  const origin = request.nextUrl.origin;
  const stripe = getStripe();
  const lineItem = product.stripe_price_id
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
            name: product.name,
            description: product.description || `${product.credits} event credits`,
          },
        },
      };

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
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

  return NextResponse.json({ ok: true, url: session.url });
}
