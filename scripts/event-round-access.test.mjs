import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  EVENT_ROUND_ACCESS_DURATION_MS,
  eventRoundEmailLoginNextPath,
} from "../src/lib/event-email-click.ts";

const eventId = "ee3f49df-bc07-4e47-92f2-90ee4a9c9e10";
const now = Date.parse("2026-07-30T20:00:00.000Z");
const startsAt = now - 60 * 60 * 1_000;
const delivery = {
  email_type: "event_reminder",
  event_id: eventId,
  frozen_payload: {
    hostStatus: "none",
    startsAt: new Date(startsAt).toISOString(),
  },
  sent_at: new Date(now - 60_000).toISOString(),
  status: "sent",
};

test("no-host reminder links can bootstrap login for either round", () => {
  for (const round of ["sharing-round", "spicy-round"]) {
    const destination = new URL(
      `http://localhost:3030/events/${eventId}/${round}`,
    );
    assert.equal(
      eventRoundEmailLoginNextPath({ delivery, destination, now }),
      `/events/${eventId}/${round}`,
    );
  }
});

test("round login is available before the event but expires exactly 24 hours after it starts", () => {
  const destination = new URL(
    `http://localhost:3030/events/${eventId}/sharing-round`,
  );
  const futureDelivery = {
    ...delivery,
    frozen_payload: {
      ...delivery.frozen_payload,
      startsAt: new Date(now + 60 * 60 * 1_000).toISOString(),
    },
  };
  assert.equal(
    eventRoundEmailLoginNextPath({
      delivery: futureDelivery,
      destination,
      now,
    }),
    `/events/${eventId}/sharing-round`,
  );
  assert.equal(
    eventRoundEmailLoginNextPath({
      delivery,
      destination,
      now: startsAt + EVENT_ROUND_ACCESS_DURATION_MS,
    }),
    null,
  );
});

test("a round delivery cannot authenticate a different or modified destination", () => {
  const destinations = [
    new URL(`http://localhost:3030/events/${eventId}/feedback`),
    new URL(
      "http://localhost:3030/events/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/sharing-round",
    ),
    new URL(
      `http://localhost:3030/events/${eventId}/sharing-round?next=/messages`,
    ),
  ];
  for (const destination of destinations) {
    assert.equal(
      eventRoundEmailLoginNextPath({ delivery, destination, now }),
      null,
    );
  }

  assert.equal(
    eventRoundEmailLoginNextPath({
      delivery: {
        ...delivery,
        frozen_payload: { ...delivery.frozen_payload, hostStatus: "assigned" },
      },
      destination: new URL(
        `http://localhost:3030/events/${eventId}/sharing-round`,
      ),
      now,
    }),
    null,
  );
});

test("the round pages use the attendee-only database function", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260731010000_no_host_round_questions.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const dataLayer = readFileSync(
    new URL("../src/lib/data/event-round.ts", import.meta.url),
    "utf8",
  );
  const sharingPage = readFileSync(
    new URL(
      "../src/app/(app)/events/[id]/sharing-round/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const spicyPage = readFileSync(
    new URL(
      "../src/app/(app)/events/[id]/spicy-round/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /create or replace function public\.get_my_event_round_question/);
  assert.match(migration, /current_timestamp_value < release_record\.opens_at/);
  assert.match(migration, /current_timestamp_value >= release_record\.closes_at/);
  assert.doesNotMatch(migration, /jsonb_agg/);
  assert.match(dataLayer, /\.rpc\("get_my_event_round_question"/);
  assert.doesNotMatch(dataLayer, /getSupabaseServiceClient/);
  assert.match(sharingPage, /roundType="sharing_time"/);
  assert.match(spicyPage, /roundType="spicy_time"/);
});
