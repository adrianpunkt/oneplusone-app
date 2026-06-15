import Stripe from "stripe";

export const STRIPE_API_VERSION = "2026-05-27.dahlia";

let stripeClient: Stripe | null = null;

export function getStripe() {
  if (stripeClient) return stripeClient;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || secretKey.startsWith("pk_")) {
    throw new Error("Missing STRIPE_SECRET_KEY.");
  }

  stripeClient = new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
  });
  return stripeClient;
}

export function getStripeWebhookSecret() {
  return process.env.APP_STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || "";
}
