import Stripe from "stripe";

export const STRIPE_API_VERSION = "2026-05-27.dahlia";
const STRIPE_REQUEST_TIMEOUT_MS = 10_000;

let stripeClient: Stripe | null = null;
let stripeWebhookCryptoProvider: ReturnType<
  typeof Stripe.createSubtleCryptoProvider
> | null = null;

export function getStripe() {
  if (stripeClient) return stripeClient;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || secretKey.startsWith("pk_")) {
    throw new Error("Missing STRIPE_SECRET_KEY.");
  }

  stripeClient = new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
    timeout: STRIPE_REQUEST_TIMEOUT_MS,
    typescript: true,
  });
  return stripeClient;
}

export function getStripeWebhookCryptoProvider() {
  if (stripeWebhookCryptoProvider) return stripeWebhookCryptoProvider;

  stripeWebhookCryptoProvider = Stripe.createSubtleCryptoProvider();
  return stripeWebhookCryptoProvider;
}

export function getStripeWebhookSecret() {
  return process.env.APP_STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || "";
}
