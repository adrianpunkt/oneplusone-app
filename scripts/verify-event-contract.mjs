import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = new URL("../supabase/migrations/20260719000000_founder_operated_event_system.sql", import.meta.url);
const contractPath = new URL("../docs/events/frozen-database-contract.md", import.meta.url);
const accessRoutePath = new URL("../src/app/event-invitation/access/route.ts", import.meta.url);
const publicPagePath = new URL("../src/app/event-invitation/page.tsx", import.meta.url);
const ledgerMigrationPath = new URL("../supabase/migrations/20260613170000_create_benefit_codes.sql", import.meta.url);

const [migration, contract, accessRoute, publicPage, ledgerMigration] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile(contractPath, "utf8"),
  readFile(accessRoutePath, "utf8"),
  readFile(publicPagePath, "utf8"),
  readFile(ledgerMigrationPath, "utf8"),
]);

const requiredFunctions = [
  "prepare_event_from_matching_group",
  "open_event_invitations",
  "set_event_capacity",
  "confirm_event_and_release_details",
  "cancel_event",
  "assign_event_host",
  "mark_event_completed",
  "record_event_replacement",
  "prepare_event_email_deliveries",
  "claim_event_email_delivery",
  "record_event_email_delivery_result",
  "create_event_invitation_access_token",
  "claim_event_invitation_access_token",
  "resolve_event_invitation_session",
  "begin_event_invitation_payment",
  "attach_event_checkout_session",
  "decline_pending_event_invitation",
  "complete_event_invitation_payment",
  "get_event_invitation_payment_result",
  "submit_event_feedback",
];
for (const functionName of requiredFunctions) {
  assert.match(migration, new RegExp(`create or replace function public\\.${functionName}\\b`, "i"));
  assert.match(contract, new RegExp(`\\b${functionName}\\b`));
}

assert.match(migration, /unique index if not exists events_matching_group_key/i);
assert.match(migration, /expires_at > now\(\)/i);
assert.match(migration, /now\(\) \+ interval '10 minutes'/i);
assert.doesNotMatch(migration, /interval '5 minutes'/i);
assert.match(migration, /event_record\.capacity/i);
assert.match(migration, /event_record\.rsvp_deadline_at/i);
assert.match(ledgerMigration, /unique \(member_id, reason, source_type, source_id\)/i);
assert.match(migration, /stripe_event_id text primary key/i);
assert.match(migration, /idempotency_key text not null unique/i);
assert.match(migration, /event_payload_is_secret_free/i);
assert.match(migration, /p_template_id text/i);
assert.match(migration, /template_id = resolved_template_id/i);
assert.match(migration, /event_record\.status = 'completed'[\s\S]*members\.marketing_eligible[\s\S]*invitations\.seat_status = 'confirmed'[\s\S]*feedback\.id is not null/i);
assert.match(migration, /top_intention_count := coalesce\(top_intention_count, 0\)/i);

for (const functionName of [
  "confirm_event_invitation",
  "begin_event_invitation_payment",
  "complete_event_invitation_payment",
  "restore_cancelled_event_confirmation",
]) {
  const start = migration.indexOf(`create or replace function public.${functionName}`);
  const end = migration.indexOf("\n$$;", start);
  const body = migration.slice(start, end);
  const invitationLock = body.indexOf("from public.event_invitations");
  const eventLock = body.indexOf("from public.events", invitationLock);
  assert.ok(invitationLock >= 0 && eventLock > invitationLock, `${functionName} must lock invitation before event`);
  assert.match(body.slice(invitationLock, eventLock), /for update/i);
}

assert.match(accessRoute, /status: 303/);
assert.match(accessRoute, /httpOnly: true/);
assert.match(accessRoute, /secure: true/);
assert.match(accessRoute, /sameSite: "lax"/);
assert.match(accessRoute, /new URL\("\/event-invitation"/);
assert.doesNotMatch(accessRoute, /console\.(log|warn|error)/);
assert.doesNotMatch(publicPage, /venue_name|venue_address|restaurant_image|profile_json|memberId|email/);

console.log(`Event contract verification passed (${requiredFunctions.length} RPCs, lock order, hold, idempotency, and bearer boundaries).`);
