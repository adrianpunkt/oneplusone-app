export const POST_EVENT_CREDIT_OFFER_PRODUCT_ID =
  "48303030-0000-4000-8000-000000000003";

export const POST_EVENT_CREDIT_OFFER_TYPE = "post_event_48h" as const;

const STRIPE_MINIMUM_CHECKOUT_LIFETIME_SECONDS = 30 * 60;
const STRIPE_MAXIMUM_CHECKOUT_LIFETIME_SECONDS = 24 * 60 * 60;
const MINUTE_MILLISECONDS = 60 * 1000;
const HOUR_MINUTES = 60;
const DAY_MINUTES = 24 * HOUR_MINUTES;

export function postEventOfferTimeRemaining(
  offerExpiresAt: string,
  nowMilliseconds = Date.now(),
) {
  const remainingMilliseconds =
    new Date(offerExpiresAt).getTime() - nowMilliseconds;

  if (!Number.isFinite(remainingMilliseconds) || remainingMilliseconds <= 0) {
    return { days: 0, hours: 0, minutes: 0, expired: true };
  }

  const totalMinutes = Math.ceil(
    remainingMilliseconds / MINUTE_MILLISECONDS,
  );
  const days = Math.floor(totalMinutes / DAY_MINUTES);
  const hours = Math.floor(
    (totalMinutes % DAY_MINUTES) / HOUR_MINUTES,
  );
  const minutes = totalMinutes % HOUR_MINUTES;

  return { days, hours, minutes, expired: false };
}

export function postEventCheckoutExpiresAt(
  offerExpiresAt: string,
  nowMilliseconds = Date.now(),
) {
  const offerExpiresAtSeconds = Math.floor(
    new Date(offerExpiresAt).getTime() / 1000,
  );
  const nowSeconds = Math.floor(nowMilliseconds / 1000);

  if (
    !Number.isFinite(offerExpiresAtSeconds) ||
    offerExpiresAtSeconds <= nowSeconds
  ) {
    return null;
  }

  return Math.min(
    Math.max(
      offerExpiresAtSeconds,
      nowSeconds + STRIPE_MINIMUM_CHECKOUT_LIFETIME_SECONDS,
    ),
    nowSeconds + STRIPE_MAXIMUM_CHECKOUT_LIFETIME_SECONDS,
  );
}
