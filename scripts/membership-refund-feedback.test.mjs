import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  hashRefundFeedbackToken,
  isRefundFeedbackExpired,
  refundFeedbackClaimAction,
  validateRefundFeedbackInput,
} from "../src/lib/membership-refund-feedback-core.ts";
import {
  isManagedMembershipRefundEventType,
  isMembershipRefundRecordId,
  normalizeMembershipRefundStatus,
} from "../src/lib/membership-refund-events.ts";

test("feedback tokens are hashed deterministically without retaining the token", () => {
  const first = hashRefundFeedbackToken("private-token");
  const second = hashRefundFeedbackToken("private-token");

  assert.equal(first, second);
  assert.equal(first.length, 64);
  assert.notEqual(first, "private-token");
  assert.notEqual(first, hashRefundFeedbackToken("tampered-token"));
});

test("feedback links expire at 30 days and reject invalid expiry values", () => {
  const now = Date.parse("2026-07-26T12:00:00.000Z");
  assert.equal(isRefundFeedbackExpired("2026-07-26T12:00:01.000Z", now), false);
  assert.equal(isRefundFeedbackExpired("2026-07-26T12:00:00.000Z", now), true);
  assert.equal(isRefundFeedbackExpired("tampered", now), true);
});

test("localhost feedback claims move to a cookie-isolated loopback origin", () => {
  assert.equal(
    refundFeedbackClaimAction("localhost:3030", null),
    "http://127.0.0.1:3030/refund-feedback/access/claim",
  );
  assert.equal(
    refundFeedbackClaimAction("localhost:3030", "https"),
    "https://127.0.0.1:3030/refund-feedback/access/claim",
  );
  assert.equal(
    refundFeedbackClaimAction("127.0.0.1:3030", null),
    "/refund-feedback/access/claim",
  );
  assert.equal(
    refundFeedbackClaimAction("dev-app.oneplusoneclub.com", "https"),
    "/refund-feedback/access/claim",
  );
});

test("accepts a product reason with optional comments", () => {
  assert.deepEqual(
    validateRefundFeedbackInput("price_or_value", "  More local options, please.  "),
    { comments: "More local options, please.", reason: "price_or_value" },
  );
  assert.deepEqual(
    validateRefundFeedbackInput("event_format_or_atmosphere", ""),
    { comments: null, reason: "event_format_or_atmosphere" },
  );
  assert.deepEqual(
    validateRefundFeedbackInput("people_or_connections", ""),
    { comments: null, reason: "people_or_connections" },
  );
});

test("requires comments for other and rejects tampered reasons", () => {
  assert.deepEqual(
    validateRefundFeedbackInput("other", ""),
    { error: "Please add comments when choosing Other." },
  );
  assert.deepEqual(
    validateRefundFeedbackInput("tampered", "comment"),
    { error: "Choose a feedback reason." },
  );
  assert.deepEqual(
    validateRefundFeedbackInput("location_or_timing", ""),
    { error: "Choose a feedback reason." },
  );
});

test("limits comments to 2,000 characters", () => {
  assert.deepEqual(
    validateRefundFeedbackInput("personal_circumstances", "a".repeat(2001)),
    { error: "Comments must be 2,000 characters or fewer." },
  );
});

test("the shared migration enforces one response and service-role-only access", async () => {
  const initialMigration = await readFile(
    new URL("../supabase/migrations/20260726230000_membership_refunds_and_feedback.sql", import.meta.url),
    "utf8",
  );
  const expandedReasonsMigration = await readFile(
    new URL("../supabase/migrations/20260727174500_expand_membership_refund_feedback_reasons.sql", import.meta.url),
    "utf8",
  );

  assert.match(initialMigration, /refund_id uuid not null unique references public\.membership_refunds/);
  assert.match(initialMigration, /feedback_expires_at > now\(\)/);
  assert.match(initialMigration, /grant all on table public\.membership_refund_feedback to service_role/);
  assert.match(initialMigration, /revoke all on table public\.membership_refund_feedback from public, anon, authenticated/);
  assert.match(expandedReasonsMigration, /'event_format_or_atmosphere'/);
  assert.match(expandedReasonsMigration, /'people_or_connections'/);
  assert.match(expandedReasonsMigration, /grant execute on function public\.submit_membership_refund_feedback/);
});

test("the app handles all requested refund webhook events and normalizes missing status", () => {
  assert.equal(isManagedMembershipRefundEventType("refund.created"), true);
  assert.equal(isManagedMembershipRefundEventType("refund.updated"), true);
  assert.equal(isManagedMembershipRefundEventType("refund.failed"), true);
  assert.equal(isManagedMembershipRefundEventType("charge.refunded"), false);
  assert.equal(normalizeMembershipRefundStatus("succeeded"), "succeeded");
  assert.equal(normalizeMembershipRefundStatus(null), "failed");
  assert.equal(isMembershipRefundRecordId("9f5947ac-e63f-4a72-b8dc-5c199183ea93"), true);
  assert.equal(isMembershipRefundRecordId("tampered"), false);
});
