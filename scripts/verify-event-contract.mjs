import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = new URL("../supabase/migrations/20260719000000_founder_operated_event_system.sql", import.meta.url);
const intentionMigrationPath = new URL("../supabase/migrations/20260720013000_use_top_event_relationship_intention.sql", import.meta.url);
const cancellationMigrationPath = new URL("../supabase/migrations/20260720150000_event_reservation_cancellation_feedback.sql", import.meta.url);
const restorationFixMigrationPath = new URL("../supabase/migrations/20260720150500_fix_restored_cancellation_reason_ambiguity.sql", import.meta.url);
const invitationRefreshMigrationPath = new URL("../supabase/migrations/20260720160000_refresh_expired_event_invitation_links.sql", import.meta.url);
const invitationRefreshPrivacyFixMigrationPath = new URL("../supabase/migrations/20260720175000_fix_invitation_refresh_payload_privacy.sql", import.meta.url);
const cancellationReasonsMigrationPath = new URL("../supabase/migrations/20260720161000_update_event_reservation_cancellation_reasons.sql", import.meta.url);
const paymentResumeMigrationPath = new URL("../supabase/migrations/20260720163000_resume_event_application_after_membership.sql", import.meta.url);
const pendingDeclineMigrationPath = new URL("../supabase/migrations/20260720172000_add_pending_member_event_type_decline.sql", import.meta.url);
const pendingDeclineOptOutMigrationPath = new URL("../supabase/migrations/20260720180000_opt_out_after_pending_event_type_decline.sql", import.meta.url);
const paidConfirmationMigrationPath = new URL("../supabase/migrations/20260720174000_preserve_paid_status_during_event_confirmation.sql", import.meta.url);
const genderBalanceMigrationPath = new URL("../supabase/migrations/20260720182000_apply_capacity_aware_gender_balance.sql", import.meta.url);
const invitationDeclineMigrationPath = new URL("../supabase/migrations/20260722120000_scanner_safe_event_invitation_declines.sql", import.meta.url);
const formatAwareDeclineMigrationPath = new URL("../supabase/migrations/20260722150000_record_format_aware_invitation_declines.sql", import.meta.url);
const deliveryClassificationMigrationPath = new URL("../supabase/migrations/20260722160000_distinguish_invitation_declines_from_cancellations.sql", import.meta.url);
const contractPath = new URL("../docs/events/frozen-database-contract.md", import.meta.url);
const accessPagePath = new URL("../src/app/event-invitation/access/page.tsx", import.meta.url);
const accessRoutePath = new URL("../src/app/event-invitation/access/claim/route.ts", import.meta.url);
const accessPreflightPath = new URL("../src/lib/event-invitation-access.ts", import.meta.url);
const checkoutRoutePath = new URL("../src/app/api/stripe/create-event-membership-checkout/route.ts", import.meta.url);
const completionRoutePath = new URL("../src/app/event-invitation/complete/route.ts", import.meta.url);
const invitationMemberSessionPath = new URL("../src/lib/event-invitation-member-session.ts", import.meta.url);
const supabaseServerPath = new URL("../src/lib/supabase/server.ts", import.meta.url);
const invitationActionsPath = new URL("../src/components/forms/invitation-actions.tsx", import.meta.url);
const pendingInvitationActionsPath = new URL("../src/components/forms/pending-event-invitation-actions.tsx", import.meta.url);
const notificationRefreshPath = new URL("../src/components/app/notification-refresh.tsx", import.meta.url);
const goingOutPagePath = new URL("../src/app/(app)/going-out/page.tsx", import.meta.url);
const invitationSessionPath = new URL("../src/lib/event-invitations.ts", import.meta.url);
const publicPagePath = new URL("../src/app/event-invitation/page.tsx", import.meta.url);
const ledgerMigrationPath = new URL("../supabase/migrations/20260613170000_create_benefit_codes.sql", import.meta.url);
const authLinkPath = new URL("../src/lib/auth-link.ts", import.meta.url);
const middlewarePath = new URL("../src/middleware.ts", import.meta.url);
const loginPagePath = new URL("../src/app/login/page.tsx", import.meta.url);
const authActionsPath = new URL("../src/lib/actions/auth.ts", import.meta.url);
const authCallbackPath = new URL("../src/app/auth/callback/route.ts", import.meta.url);
const authConfirmPath = new URL("../src/app/auth/confirm/page.tsx", import.meta.url);
const declinePagePath = new URL("../src/app/event-invitation/decline/page.tsx", import.meta.url);
const declineRoutePath = new URL("../src/app/event-invitation/decline/confirm/route.ts", import.meta.url);
const declineResolverPath = new URL("../src/lib/event-invitation-decline.ts", import.meta.url);
const declineReasonsPath = new URL("../src/lib/event-invitation-decline-reasons.ts", import.meta.url);
const eventEmailDeliveryPath = new URL("../src/lib/event-email-delivery.ts", import.meta.url);
const eventEmailClickPath = new URL("../src/lib/event-email-click.ts", import.meta.url);
const nextConfigPath = new URL("../next.config.ts", import.meta.url);

const [
  migration,
  intentionMigration,
  cancellationMigration,
  restorationFixMigration,
  invitationRefreshMigration,
  invitationRefreshPrivacyFixMigration,
  cancellationReasonsMigration,
  paymentResumeMigration,
  pendingDeclineMigration,
  pendingDeclineOptOutMigration,
  paidConfirmationMigration,
  genderBalanceMigration,
  invitationDeclineMigration,
  formatAwareDeclineMigration,
  deliveryClassificationMigration,
  contract,
  accessPage,
  accessRoute,
  accessPreflight,
  checkoutRoute,
  completionRoute,
  invitationMemberSession,
  supabaseServer,
  invitationActions,
  pendingInvitationActions,
  notificationRefresh,
  goingOutPage,
  invitationSession,
  publicPage,
  ledgerMigration,
  authLink,
  middleware,
  loginPage,
  authActions,
  authCallback,
  authConfirm,
  declinePage,
  declineRoute,
  declineResolver,
  declineReasons,
  eventEmailDelivery,
  eventEmailClick,
  nextConfig,
] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile(intentionMigrationPath, "utf8"),
  readFile(cancellationMigrationPath, "utf8"),
  readFile(restorationFixMigrationPath, "utf8"),
  readFile(invitationRefreshMigrationPath, "utf8"),
  readFile(invitationRefreshPrivacyFixMigrationPath, "utf8"),
  readFile(cancellationReasonsMigrationPath, "utf8"),
  readFile(paymentResumeMigrationPath, "utf8"),
  readFile(pendingDeclineMigrationPath, "utf8"),
  readFile(pendingDeclineOptOutMigrationPath, "utf8"),
  readFile(paidConfirmationMigrationPath, "utf8"),
  readFile(genderBalanceMigrationPath, "utf8"),
  readFile(invitationDeclineMigrationPath, "utf8"),
  readFile(formatAwareDeclineMigrationPath, "utf8"),
  readFile(deliveryClassificationMigrationPath, "utf8"),
  readFile(contractPath, "utf8"),
  readFile(accessPagePath, "utf8"),
  readFile(accessRoutePath, "utf8"),
  readFile(accessPreflightPath, "utf8"),
  readFile(checkoutRoutePath, "utf8"),
  readFile(completionRoutePath, "utf8"),
  readFile(invitationMemberSessionPath, "utf8"),
  readFile(supabaseServerPath, "utf8"),
  readFile(invitationActionsPath, "utf8"),
  readFile(pendingInvitationActionsPath, "utf8"),
  readFile(notificationRefreshPath, "utf8"),
  readFile(goingOutPagePath, "utf8"),
  readFile(invitationSessionPath, "utf8"),
  readFile(publicPagePath, "utf8"),
  readFile(ledgerMigrationPath, "utf8"),
  readFile(authLinkPath, "utf8"),
  readFile(middlewarePath, "utf8"),
  readFile(loginPagePath, "utf8"),
  readFile(authActionsPath, "utf8"),
  readFile(authCallbackPath, "utf8"),
  readFile(authConfirmPath, "utf8"),
  readFile(declinePagePath, "utf8"),
  readFile(declineRoutePath, "utf8"),
  readFile(declineResolverPath, "utf8"),
  readFile(declineReasonsPath, "utf8"),
  readFile(eventEmailDeliveryPath, "utf8"),
  readFile(eventEmailClickPath, "utf8"),
  readFile(nextConfigPath, "utf8"),
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
assert.match(intentionMigration, /majority_value := top_intention/i);
assert.match(intentionMigration, /Marriage \/ life partner/i);
assert.match(intentionMigration, /perform public\.refresh_event_summary_snapshot/i);
assert.doesNotMatch(intentionMigration, /majority_intention_override/i);
assert.match(cancellationMigration, /create table if not exists public\.event_reservation_cancellations/i);
assert.match(cancellationMigration, /create function public\.cancel_event_confirmation\s*\(\s*p_invitation_id uuid,\s*p_reason text,\s*p_details text default null/i);
assert.match(cancellationMigration, /reservation_cancellation_received/i);
assert.match(cancellationMigration, /initial_credit_outcome in \('not_spent', 'refunded', 'replacement_pending'\)/i);
assert.match(cancellationMigration, /'member-cancellation-' \|\| cancellation_id::text/i);
assert.match(cancellationReasonsMigration, /'no_longer_interested'/i);
assert.match(cancellationReasonsMigration, /'something_else'/i);
assert.match(
  cancellationReasonsMigration,
  /if normalized_reason not in \(\s*'illness',\s*'schedule_changed',\s*'no_longer_interested',\s*'something_else'\s*\)/i,
);
assert.match(restorationFixMigration, /ledger\.reason = 'event_waitlist_replacement_refund'/i);
assert.doesNotMatch(restorationFixMigration, /\breason text;/i);
assert.match(invitationRefreshMigration, /create or replace function public\.refresh_expired_event_invitation_link\b/i);
assert.match(invitationRefreshMigration, /least\(\s*event_record\.rsvp_deadline_at/i);
assert.match(invitationRefreshMigration, /'status', 'deadline_passed'/i);
assert.match(invitationRefreshMigration, /'pending-invite-refresh-' \|\| token_record\.id::text/i);
assert.match(invitationRefreshMigration, /refreshSourceAccessId/);
assert.doesNotMatch(invitationRefreshMigration, /refreshSourceTokenId/);
assert.match(invitationRefreshPrivacyFixMigration, /create or replace function public\.refresh_expired_event_invitation_link\b/i);
assert.match(invitationRefreshPrivacyFixMigration, /refreshSourceAccessId/);
assert.doesNotMatch(invitationRefreshPrivacyFixMigration, /refreshSourceTokenId/);
assert.match(contract, /\brefresh_expired_event_invitation_link\b/i);
assert.match(paymentResumeMigration, /create or replace function public\.prepare_active_event_invitation_resume\b/i);
assert.match(paymentResumeMigration, /then 'ready_to_confirm'/i);
assert.match(paymentResumeMigration, /now\(\) \+ interval '10 minutes'/i);
assert.match(contract, /\bprepare_active_event_invitation_resume\b/i);
assert.match(pendingDeclineMigration, /'event_type_not_interested'/i);
assert.match(pendingDeclineMigration, /create or replace function public\.decline_pending_event_invitation\b/i);
assert.match(pendingDeclineMigration, /set receives_event_invitations = false/i);
assert.match(pendingDeclineOptOutMigration, /declines\.reason = 'event_type_not_interested'/i);
assert.match(pendingDeclineOptOutMigration, /set receives_event_invitations = false/i);
assert.match(contract, /\bevent_type_not_interested\b/i);
assert.match(paidConfirmationMigration, /create or replace function public\.confirm_event_invitation\b/i);
assert.equal(
  (paidConfirmationMigration.match(/when invitation_record\.payment_status = 'paid' then 'paid'/gi) || []).length,
  2,
);
assert.doesNotMatch(paidConfirmationMigration, /payment_status = 'not_required'/i);
assert.match(genderBalanceMigration, /create or replace function public\.event_gender_balance_requires_waitlist\b/i);
assert.match(genderBalanceMigration, /when coalesce\(p_event_capacity, 8\) >= 10 then 4/i);
assert.match(genderBalanceMigration, /p_eligible_opposite_waiter_exists/i);
assert.match(genderBalanceMigration, /invitations\.waitlist_reason = 'balance'/i);
assert.match(genderBalanceMigration, /public\.event_invitation_has_credit_debit/i);
assert.match(genderBalanceMigration, /public\.event_gender_balance_requires_waitlist\(\s*member_gender,\s*female_count,\s*male_count,\s*event_record\.capacity,\s*eligible_opposite_waiter_exists\s*\)/i);
assert.doesNotMatch(genderBalanceMigration, /female_count > male_count|male_count > female_count/i);
assert.ok(
  genderBalanceMigration.indexOf("if occupied_count >= event_record.capacity")
    < genderBalanceMigration.indexOf("if public.event_gender_balance_requires_waitlist"),
  "Capacity must be evaluated before gender balance",
);

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
assert.match(accessRoute, /secure: cookie\.secure/);
assert.match(accessRoute, /sameSite: "lax"/);
assert.match(accessRoute, /new URL\("\/event-invitation"/);
assert.match(accessRoute, /export async function POST/);
assert.match(accessPreflight, /refresh_expired_event_invitation_link/);
assert.match(accessPreflight, /deliverMemberEventEmail/);
assert.match(accessPage, /preflightEventInvitationAccess/);
assert.match(accessPreflight, /resolveActiveMemberEventInvitationAccess/);
assert.match(accessPreflight, /member\?\.membership_status !== "active"/);
assert.doesNotMatch(accessPreflight, /invitation\.response_status !== "accepted"/);
assert.ok(
  accessPage.indexOf("resolveActiveMemberEventInvitationAccess(token)")
    < accessPage.indexOf("preflightEventInvitationAccess(token)"),
  "Active members must bypass the pending-member invitation page before token preflight",
);
assert.match(accessRoute, /resolveActiveMemberEventInvitationAccess\(token\)/);
assert.doesNotMatch(accessRoute, /console\.(log|warn|error)/);
assert.match(accessPage, /action="\/event-invitation\/access\/claim"/);
assert.match(accessPage, /method="post"/);
assert.match(accessPage, /Continue to invitation/);
assert.doesNotMatch(accessPage, /claim_event_invitation_access_token/);
assert.match(checkoutRoute, /success_url: `\$\{origin\}\/event-invitation\/complete\?session_id=\{CHECKOUT_SESSION_ID\}`/);
assert.doesNotMatch(checkoutRoute, /success_url: `\$\{origin\}\/event-invitation\?payment=success/);
assert.match(completionRoute, /readEventInvitationSessionToken\(request\.cookies, request\.nextUrl\)/);
assert.match(completionRoute, /reconcileEventMembershipCheckout\(\s*checkoutSessionId,\s*invitationSession\.invitationId/);
assert.match(completionRoute, /createEventInvitationMemberSession/);
assert.match(completionRoute, /supabaseClient: createSupabaseRouteClient\(request, response\)/);
assert.match(completionRoute, /new URL\(next, request\.nextUrl\.origin\)/);
assert.match(completionRoute, /invitationResumePath\(invitationAccess\)/);
assert.match(completionRoute, /url\.searchParams\.set\("payment", "confirmed"\)/);
assert.match(invitationMemberSession, /supabaseClient \|\| await createSupabaseServerClient\(\)/);
assert.match(invitationMemberSession, /member\?\.id !== expectedMemberId/);
assert.match(invitationMemberSession, /member\.membership_status !== "active"/);
assert.match(invitationMemberSession, /method: "event_invitation"/);
assert.match(supabaseServer, /export function createSupabaseRouteClient/);
assert.match(supabaseServer, /response\.cookies\.set\(name, value, options\)/);
assert.match(invitationActions, /url\.searchParams\.delete\("apply"\)/);
assert.match(invitationActions, /url\.searchParams\.delete\("payment"\)/);
assert.match(invitationActions, /showPaymentConfirmation/);
assert.match(invitationActions, /copy\.paymentConfirmed/);
assert.match(invitationActions, /copy\.paymentWelcome/);
assert.match(invitationActions, /success-checkmark-transparent\.webp/);
assert.match(invitationActions, /uppercase[\s\S]*text-lipstick-red/);
assert.match(invitationActions, /window\.history\.replaceState/);
assert.match(invitationActions, /onOpenChange=\{handleOpenChange\}/);
assert.match(invitationActions, /if \(!nextOpen && initiallyOpen\)/);
const invitationUrlCleanup = invitationActions.slice(
  invitationActions.indexOf("export function InvitationApplicationUrlCleanup"),
  invitationActions.indexOf("export type InvitationActionCopy"),
);
assert.doesNotMatch(invitationUrlCleanup, /router\.(refresh|replace|push)/);
assert.match(notificationRefresh, /usePathname/);
assert.match(
  notificationRefresh,
  /pathname === ["']\/going-out["'][\s\S]*pathname\.startsWith\(["']\/going-out\/["']\)/,
);
assert.match(notificationRefresh, /if \(refreshDisabled\) return;/);
assert.match(goingOutPage, /const applyInvitationId = searchParamValue\(apply\)/);
assert.match(goingOutPage, /const paymentConfirmed = searchParamValue\(payment\) === "confirmed"/);
assert.match(goingOutPage, /const autoOpenInvitationId = pendingInvitations\.some/);
assert.match(goingOutPage, /invitationId=\{autoOpenInvitationId \? undefined : applyInvitationId\}/);
assert.match(goingOutPage, /autoOpenApplication=\{autoOpenInvitationId === invitation\.id\}/);
assert.match(goingOutPage, /initiallyOpenInvitationId=\{autoOpenApplication \? invitation\.id : undefined\}/);
assert.match(authLink, /const path = safeInternalPath\(value, fallback\)/);
assert.match(authLink, /export function buildMemberLoginPath/);
assert.match(authLink, /new URLSearchParams\(\{ next \}\)/);
assert.match(middleware, /if \(!user && isMemberAppPath\(request\.nextUrl\.pathname\)\)/);
assert.match(middleware, /const requestedPath = `\$\{request\.nextUrl\.pathname\}\$\{request\.nextUrl\.search\}`/);
assert.match(middleware, /new URL\(buildMemberLoginPath\(requestedPath\), request\.url\)/);
assert.doesNotMatch(middleware, /x-oneplusone-request-path|requestHeaders\.set/);
assert.match(loginPage, /const next = normalizeMemberLoginNextPath\(firstSearchParam\(nextParam\)\)/);
assert.match(loginPage, /if \(context\) redirect\(next\)/);
assert.ok(
  (authActions.match(/redirect\(next\)/g) || []).length >= 2,
  "Both password and OTP login must preserve the validated destination",
);
assert.match(authCallback, /const next = normalizeMemberLoginNextPath\(requestUrl\.searchParams\.get\("next"\)\)/);
assert.match(authCallback, /NextResponse\.redirect\(new URL\(next, requestUrl\.origin\)\)/);
assert.match(authConfirm, /const next = normalizeMemberLoginNextPath\(firstValue\(formData\.get\("next"\)\)\)/);
assert.match(authConfirm, /redirect\(next\)/);
assert.match(invitationSession, /url\.protocol === "http:"/);
assert.match(invitationSession, /\["localhost", "127\.0\.0\.1", "\[::1\]"\]/);
assert.match(invitationSession, /localEventInvitationSessionCookie/);
assert.match(invitationSession, /event_invitation_declines/);
assert.match(publicPage, /The event RSVP deadline has passed and reservations are no longer accepted\./);
assert.match(publicPage, /we sent you a new link/i);
assert.match(publicPage, /Thanks for the feedback\./i);
assert.match(publicPage, /We will no longer send you invitations to our events\./i);
assert.match(publicPage, /Maybe next time\./i);
assert.match(publicPage, /event-invitation\/complete\?session_id=/);
assert.match(publicPage, /internalSession\?\.membershipStatus === "active"/);
assert.doesNotMatch(publicPage, /internalSession\?\.paymentStatus === "paid"/);
assert.doesNotMatch(publicPage, /Ask the club team for a fresh invitation/i);
assert.doesNotMatch(publicPage, /venue_name|venue_address|restaurant_image|profile_json|memberId|email_norm|member_email/);

for (const functionName of [
  "create_event_invitation_decline_token",
  "resolve_event_invitation_decline_token",
  "decline_event_invitation_from_token",
]) {
  assert.match(
    invitationDeclineMigration,
    new RegExp(`create or replace function public\\.${functionName}\\b`, "i"),
  );
  assert.match(contract, new RegExp(`\\b${functionName}\\b`, "i"));
}
assert.match(invitationDeclineMigration, /create table if not exists public\.event_invitation_decline_tokens/i);
assert.match(invitationDeclineMigration, /token_hash text not null unique/i);
assert.match(invitationDeclineMigration, /public\.hash_payment_resume_secret\(raw_token\)/i);
assert.match(invitationDeclineMigration, /least\(\s*event_record\.rsvp_deadline_at,\s*now\(\) \+ interval '7 days'/i);
assert.match(invitationDeclineMigration, /language plpgsql\s+stable\s+security definer[\s\S]*resolve_event_invitation_decline_token|create or replace function public\.resolve_event_invitation_decline_token[\s\S]*language plpgsql\s+stable/i);
assert.match(invitationDeclineMigration, /create or replace function public\.perform_event_invitation_decline/i);
assert.equal(
  (invitationDeclineMigration.match(/public\.perform_event_invitation_decline\(/g) || []).length,
  5,
  "The active, pending-session, and bearer-token entry points must share one private helper",
);
assert.match(invitationDeclineMigration, /set used_at = coalesce\(used_at, now\(\)\)[\s\S]*where invitation_id = invitation_record\.id/i);
assert.match(invitationDeclineMigration, /'invitationDeclineTokenId', decline_token_id/i);
assert.match(invitationDeclineMigration, /'invitationDeclineToken', raw_decline_token/i);
assert.match(invitationDeclineMigration, /grant execute on function public\.resolve_event_invitation_decline_token\(text\)\s+to service_role/i);
assert.match(invitationDeclineMigration, /grant execute on function public\.decline_event_invitation_from_token\(text, text, text\)\s+to service_role/i);

assert.match(formatAwareDeclineMigration, /'prefers_saturday_dinner'/i);
assert.match(formatAwareDeclineMigration, /normalized_reason = 'prefers_saturday_dinner'[\s\S]*event_record\.event_format <> 'brunch'/i);
assert.match(formatAwareDeclineMigration, /normalized_reason = 'prefers_sunday_brunch'[\s\S]*event_record\.event_format <> 'dinner'/i);
assert.match(formatAwareDeclineMigration, /create or replace function public\.perform_event_invitation_decline/i);
assert.match(formatAwareDeclineMigration, /'invitation_declined'/i);
assert.match(deliveryClassificationMigration, /'invitation_declined'/i);
assert.match(deliveryClassificationMigration, /coalesce\(new\.payload, '\{\}'::jsonb\) \? 'cancellationId'[\s\S]*then 'reservation_cancellation_received'[\s\S]*else 'invitation_declined'/i);
assert.match(deliveryClassificationMigration, /before insert or update of email_type, payload/i);
assert.match(deliveryClassificationMigration, /where email_type = 'cancellation_received'/i);
assert.match(contract, /`prefers_saturday_dinner`/i);
assert.match(contract, /`prefers_sunday_brunch`/i);

assert.match(declinePage, /export const dynamic = "force-dynamic"/);
assert.match(declinePage, /referrer: "no-referrer"/);
assert.match(declinePage, /robots: \{ follow: false, index: false \}/);
assert.match(declinePage, /action="\/event-invitation\/decline\/confirm"/);
assert.match(declinePage, /method="post"/);
assert.match(declinePage, /name="reason"[\s\S]*required/);
assert.doesNotMatch(declinePage, /autoSubmit|defaultChecked|checked=/);
assert.doesNotMatch(declinePage, /decline_event_invitation_from_token/);
assert.match(declinePage, /status=kept/);
assert.match(declinePage, /context\.eventFormat/);
assert.match(declinePage, /context\.startsAt/);
assert.match(declinePage, /context\.city/);
assert.match(declinePage, /isEventInvitationDeclineReasonForFormat/);
assert.match(publicPage, /eventFormat=\{event\.eventFormat\}/);
assert.match(invitationActions, /eventInvitationAlternativeDeclineReason\(eventFormat\)/);
assert.match(invitationActions, /const canDecline =\s*!isOnWaitlist/);
assert.match(invitationActions, /<CancelInvitationForm\s+context="waitlist"/);
assert.match(goingOutPage, /<CancelInvitationForm\s+context="waitlist"/);
assert.match(pendingInvitationActions, /isEventInvitationDeclineReasonForFormat\(value, eventFormat\)/);
assert.match(declineReasons, /if \(eventFormat === "brunch"\) return "prefers_saturday_dinner"/);
assert.match(declineReasons, /if \(eventFormat === "dinner"\) return "prefers_sunday_brunch"/);
assert.match(declineResolver, /resolve_event_invitation_decline_token/);
assert.doesNotMatch(declineResolver, /decline_event_invitation_from_token/);

assert.match(declineRoute, /export async function POST/);
assert.match(declineRoute, /decline_event_invitation_from_token/);
assert.match(declineRoute, /details\.length > 500/);
assert.match(declineRoute, /status: "validation",[\s\S]*token/);
assert.match(declineRoute, /deliverMemberEventEmailFromResult\(result\)/);
assert.match(declineRoute, /status: 303/);
assert.match(declineRoute, /Cache-Control", "private, no-store, max-age=0"/);
assert.doesNotMatch(declineRoute, /console\.(?:log|warn|error)\([^\n]*token/i);

assert.match(eventEmailDelivery, /invitationDeclineToken\?: string/);
assert.match(eventEmailDelivery, /"invitation_declined:en"/);
assert.match(eventEmailDelivery, /declineUrl/);
assert.match(eventEmailDelivery, /\/event-invitation\/decline/);
assert.match(eventEmailClick, /"declineUrl"/);
assert.match(nextConfig, /source: "\/event-invitation\/decline\/:path\*"/);
assert.match(nextConfig, /Referrer-Policy", value: "no-referrer"/);
assert.match(nextConfig, /X-Robots-Tag", value: "noindex, nofollow, noarchive"/);

console.log(`Event contract verification passed (${requiredFunctions.length + 3} RPCs, lock order, hold, idempotency, scanner-safe decline, and bearer boundaries).`);
