import assert from "node:assert/strict";
import test from "node:test";

import {
  eventInvitationAlternativeDeclineReason,
  isEventInvitationDeclineReason,
  isEventInvitationDeclineReasonForFormat,
} from "../src/lib/event-invitation-decline-reasons.ts";

test("brunch invitations offer Saturday dinner as the alternative", () => {
  assert.equal(
    eventInvitationAlternativeDeclineReason("brunch"),
    "prefers_saturday_dinner",
  );
  assert.equal(
    isEventInvitationDeclineReasonForFormat("prefers_saturday_dinner", "brunch"),
    true,
  );
  assert.equal(
    isEventInvitationDeclineReasonForFormat("prefers_sunday_brunch", "brunch"),
    false,
  );
});

test("dinner invitations offer Sunday brunch as the alternative", () => {
  assert.equal(
    eventInvitationAlternativeDeclineReason("dinner"),
    "prefers_sunday_brunch",
  );
  assert.equal(
    isEventInvitationDeclineReasonForFormat("prefers_sunday_brunch", "dinner"),
    true,
  );
  assert.equal(
    isEventInvitationDeclineReasonForFormat("prefers_saturday_dinner", "dinner"),
    false,
  );
});

test("other events do not expose a format alternative", () => {
  assert.equal(eventInvitationAlternativeDeclineReason("other"), null);
  assert.equal(
    isEventInvitationDeclineReasonForFormat("prefers_saturday_dinner", "other"),
    false,
  );
  assert.equal(
    isEventInvitationDeclineReasonForFormat("prefers_sunday_brunch", "other"),
    false,
  );
  assert.equal(
    isEventInvitationDeclineReasonForFormat("weekend_unavailable", "other"),
    true,
  );
});

test("both format-specific values are valid stored decline reasons", () => {
  assert.equal(isEventInvitationDeclineReason("prefers_saturday_dinner"), true);
  assert.equal(isEventInvitationDeclineReason("prefers_sunday_brunch"), true);
  assert.equal(isEventInvitationDeclineReason("event_type_not_interested"), false);
});
