import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  FEEDBACK_EMAIL_LOGIN_MAX_AGE_MS,
  feedbackEmailLoginNextPath,
} from "../src/lib/event-email-click.ts";

const eventId = "ee3f49df-bc07-4e47-92f2-90ee4a9c9e10";
const now = Date.parse("2026-07-30T12:00:00.000Z");
const delivery = {
  email_type: "feedback_request",
  event_id: eventId,
  sent_at: new Date(now - 60_000).toISOString(),
  status: "sent",
};

test("recent feedback links preserve their selected response after login", () => {
  const destination = new URL(
    `http://localhost:3030/events/${eventId}/feedback?attended=yes&overall_rating=3`,
  );

  assert.equal(
    feedbackEmailLoginNextPath({ delivery, destination, now }),
    `/events/${eventId}/feedback?attended=yes&overall_rating=3`,
  );
});

test("feedback access accepts the form and did-not-attend links", () => {
  assert.equal(
    feedbackEmailLoginNextPath({
      delivery,
      destination: new URL(`http://localhost:3030/events/${eventId}/feedback`),
      now,
    }),
    `/events/${eventId}/feedback`,
  );
  assert.equal(
    feedbackEmailLoginNextPath({
      delivery,
      destination: new URL(
        `http://localhost:3030/events/${eventId}/feedback?attended=no`,
      ),
      now,
    }),
    `/events/${eventId}/feedback?attended=no`,
  );
});

test("a delivery token cannot authenticate another destination", () => {
  for (const destination of [
    new URL("http://localhost:3030/messages"),
    new URL(
      "http://localhost:3030/events/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/feedback?attended=yes&overall_rating=3",
    ),
    new URL(
      `http://localhost:3030/events/${eventId}/feedback?attended=yes&overall_rating=9`,
    ),
    new URL(
      `http://localhost:3030/events/${eventId}/feedback?attended=yes&overall_rating=3&next=/messages`,
    ),
  ]) {
    assert.equal(
      feedbackEmailLoginNextPath({ delivery, destination, now }),
      null,
    );
  }
});

test("only recent, sent feedback deliveries can bootstrap login", () => {
  const destination = new URL(
    `http://localhost:3030/events/${eventId}/feedback?attended=yes&overall_rating=3`,
  );
  const expiredDelivery = {
    ...delivery,
    sent_at: new Date(now - FEEDBACK_EMAIL_LOGIN_MAX_AGE_MS - 1).toISOString(),
  };

  assert.equal(
    feedbackEmailLoginNextPath({ delivery: expiredDelivery, destination, now }),
    null,
  );
  assert.equal(
    feedbackEmailLoginNextPath({
      delivery: { ...delivery, email_type: "event_reminder" },
      destination,
      now,
    }),
    null,
  );
  assert.equal(
    feedbackEmailLoginNextPath({
      delivery: { ...delivery, status: "failed" },
      destination,
      now,
    }),
    null,
  );
});

test("the click route exchanges a valid feedback delivery for a member login link", () => {
  const route = readFileSync(
    new URL("../src/app/email/click/route.ts", import.meta.url),
    "utf8",
  );
  const confirmPage = readFileSync(
    new URL("../src/app/auth/confirm/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(route, /record_event_email_click/);
  assert.match(route, /createFeedbackEmailLoginRedirect/);
  assert.match(route, /feedbackLoginUrl\s+\?\s+new URL\(feedbackLoginUrl\)/);
  assert.match(
    confirmPage,
    /if \(autoSubmit\) return loginRedirectPath\("expired-link", next, emailHint\)/,
  );
  assert.match(confirmPage, /activeSessionMatchesEmailHint\(supabase, emailHint\)/);
});
