import assert from "node:assert/strict";
import test from "node:test";

import {
  canRestoreCancelledInvitation,
  isPendingInvitation,
  isRejectedInvitation,
  shouldShowCannotMakeItStatus,
} from "../src/lib/event-invitation-classification.ts";

function invitation(status, respondedAt = null) {
  return { responded_at: respondedAt, status };
}

test("unanswered invitations remain pending", () => {
  assert.equal(isPendingInvitation(invitation("invited")), true);
  assert.equal(isPendingInvitation(invitation("waitlisted")), true);
  assert.equal(
    isPendingInvitation(invitation("waitlisted", "2026-07-20T18:00:00Z")),
    false,
  );
});

test("a cancelled reservation is rejected instead of becoming pending again", () => {
  const cancelledReservation = invitation(
    "cancelled",
    "2026-07-20T17:00:00Z",
  );

  assert.equal(isPendingInvitation(cancelledReservation), false);
  assert.equal(isRejectedInvitation(cancelledReservation), true);
});

test("declined and expired invitations are rejected", () => {
  assert.equal(isRejectedInvitation(invitation("declined")), true);
  assert.equal(isRejectedInvitation(invitation("expired")), true);
  assert.equal(isRejectedInvitation(invitation("confirmed")), false);
});

test("member cancellations do not look like club event cancellations", () => {
  assert.equal(
    shouldShowCannotMakeItStatus("cancelled", "inviting"),
    true,
  );
  assert.equal(
    shouldShowCannotMakeItStatus("cancelled", "cancelled"),
    false,
  );
  assert.equal(shouldShowCannotMakeItStatus("declined", "inviting"), true);
});

test("a cancelled reservation can be restored only while its seat is available", () => {
  const restorableReservation = {
    ...invitation("cancelled", "2026-07-20T17:00:00Z"),
    confirmed_at: "2026-07-20T17:00:00Z",
    events: {
      rsvp_deadline_at: "2026-07-22T18:00:00Z",
      status: "inviting",
    },
    replacement_found: false,
  };

  assert.equal(
    canRestoreCancelledInvitation(
      restorableReservation,
      new Date("2026-07-21T18:00:00Z").getTime(),
    ),
    true,
  );
  assert.equal(
    canRestoreCancelledInvitation(
      restorableReservation,
      new Date("2026-07-22T18:00:00Z").getTime(),
    ),
    false,
  );
  assert.equal(
    canRestoreCancelledInvitation(
      { ...restorableReservation, replacement_found: true },
      new Date("2026-07-21T18:00:00Z").getTime(),
    ),
    false,
  );
});
