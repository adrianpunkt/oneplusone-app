import assert from "node:assert/strict";
import test from "node:test";

import { pastEventPrimaryHref } from "../src/lib/going-out-event-action.ts";

const eventId = "ee3f49df-bc07-4e47-92f2-90ee4a9c9e10";

function actionHref(overrides = {}) {
  return pastEventPrimaryHref({
    canOpenPostEventDetails: true,
    eventId,
    feedbackAttended: false,
    feedbackSubmitted: false,
    hasEvent: true,
    ...overrides,
  });
}

test("completed events ask for feedback before showing messaging", () => {
  assert.equal(actionHref(), `/events/${eventId}/feedback`);
});

test("completed events show messaging after attended feedback", () => {
  assert.equal(
    actionHref({ feedbackAttended: true, feedbackSubmitted: true }),
    `/events/${eventId}/connect`,
  );
});

test("completed events hide the action after non-attendance feedback", () => {
  assert.equal(
    actionHref({ feedbackAttended: false, feedbackSubmitted: true }),
    null,
  );
});

test("events without open post-event details keep their details link", () => {
  assert.equal(
    actionHref({
      canOpenPostEventDetails: false,
      feedbackAttended: false,
      feedbackSubmitted: true,
    }),
    `/events/${eventId}`,
  );
});
