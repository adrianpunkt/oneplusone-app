import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  postEventCheckoutExpiresAt,
  postEventOfferTimeRemaining,
} from "../src/lib/post-event-credit-offer.ts";

const NOW = Date.parse("2026-08-03T12:00:00.000Z");
const NOW_SECONDS = NOW / 1000;

const offerEmailLmx = await Promise.all(
  ["en", "es"].map(async (locale) => ({
    locale,
    source: await readFile(
      new URL(
        `../docs/events/loops-lmx/post-event-credit-offer-${locale}.lmx`,
        import.meta.url,
      ),
      "utf8",
    ),
  })),
);

test("uses the offer deadline when it is within Stripe's checkout window", () => {
  assert.equal(
    postEventCheckoutExpiresAt("2026-08-03T14:00:00.000Z", NOW),
    NOW_SECONDS + 2 * 60 * 60,
  );
});

test("caps long-lived checkout sessions at 24 hours", () => {
  assert.equal(
    postEventCheckoutExpiresAt("2026-08-05T12:00:00.000Z", NOW),
    NOW_SECONDS + 24 * 60 * 60,
  );
});

test("gives an in-progress checkout Stripe's minimum 30-minute lifetime", () => {
  assert.equal(
    postEventCheckoutExpiresAt("2026-08-03T12:10:00.000Z", NOW),
    NOW_SECONDS + 30 * 60,
  );
});

test("rejects expired and invalid offer deadlines", () => {
  assert.equal(
    postEventCheckoutExpiresAt("2026-08-03T12:00:00.000Z", NOW),
    null,
  );
  assert.equal(postEventCheckoutExpiresAt("not-a-date", NOW), null);
});

test("splits the remaining offer window into rounded days, hours, and minutes", () => {
  assert.deepEqual(
    postEventOfferTimeRemaining("2026-08-04T14:01:01.000Z", NOW),
    { days: 1, hours: 2, minutes: 2, expired: false },
  );
});

test("marks elapsed and invalid offer windows as expired", () => {
  assert.deepEqual(
    postEventOfferTimeRemaining("2026-08-03T12:00:00.000Z", NOW),
    { days: 0, hours: 0, minutes: 0, expired: true },
  );
  assert.deepEqual(postEventOfferTimeRemaining("not-a-date", NOW), {
    days: 0,
    hours: 0,
    minutes: 0,
    expired: true,
  });
});

test("email copy matches the 48-hour database offer window", () => {
  for (const { locale, source } of offerEmailLmx) {
    assert.match(source, /48 (?:hours|horas)/i, `${locale} must state 48 hours`);
    assert.doesNotMatch(source, /24 (?:hours|horas)/i, `${locale} must not state 24 hours`);
    assert.doesNotMatch(source, /<Paragraph\b[^>]*><\/Paragraph>/, `${locale} spacers must contain a line break`);
  }
});
