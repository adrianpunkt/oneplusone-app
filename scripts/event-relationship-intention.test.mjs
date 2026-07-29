import assert from "node:assert/strict";
import test from "node:test";

import { eventRelationshipIntention } from "../src/lib/events/relationship-intention.ts";

test("the event override wins over a stale computed summary", () => {
  assert.equal(
    eventRelationshipIntention(
      {
        en: { majority_intention_override: "Exclusive relationship" },
        es: { majority_intention_override: "relación exclusiva" },
      },
      "Casual dating, seeing where it goes",
    ),
    "Exclusive relationship",
  );
});

test("the computed summary remains a fallback for legacy events", () => {
  assert.equal(
    eventRelationshipIntention({}, "Casual dating, seeing where it goes"),
    "Casual dating, seeing where it goes",
  );
});

test("blank event overrides do not hide the computed summary", () => {
  assert.equal(
    eventRelationshipIntention(
      { en: { majority_intention_override: "   " } },
      "Marriage / life partner",
    ),
    "Marriage / life partner",
  );
});
