# Founder-operated event system — agent briefs

These briefs describe the system to implement. The current rollout date belongs in the separate launch checklist and is intentionally absent from the engineering prompts.

Read first:

- [Events master plan](./master-plan.md)
- [Launch checklist](./monday-invitation-launch.md)

## Operating model

The founders operate the first version through explicit controls in ops. Do not add cron jobs, scheduled workers, or automatic event state transitions.

The system must support these commands:

1. Create a draft event from a fixed matching group.
2. Review the event, invitees, and email branches without sending.
3. Send invitations and move the event to `inviting`.
4. Review responses, holds, payments, capacity, and waitlists.
5. Send a non-responder reminder when a founder chooses.
6. Confirm the event, release venue details, and send confirmation emails.
7. Assign a host and send the host package.
8. Cancel the event and notify participants.
9. Record participant cancellations, replacements, and credit returns.
10. Send event reminders, feedback requests, and the post-event offer when due.

Member actions may trigger their immediate result email, such as seat confirmed, waitlisted, or cancellation received. Every email action must be durable and idempotent.

## Ownership

Use two coding agents and one coordinator.

| Role | Repository | Database ownership | Git/deploy ownership |
|---|---|---|---|
| App + database agent | `/Users/adrian/projects/oneplusoneclub/app` | Sole owner of migrations and RPC contracts | Stops before commit/push/deploy |
| Ops + email agent | `/Users/adrian/projects/oneplusoneclub/ops` | Must not edit migrations or RPC definitions | Stops before commit/push/deploy/send |
| Coordinator | All repositories and Loops | Reviews, mirrors, and deploys final migration | Integrates, tests, commits, pushes, deploys, and sends |

The app agent owns the database because the app migration history contains the member, event, invitation, credit, payment, feedback, and messaging functions being changed.

## Copy-paste prompt: app + database agent

```text
You own the member-facing event system and the complete database contract.

Repository:
/Users/adrian/projects/oneplusoneclub/app

Read completely before editing:
- /Users/adrian/projects/oneplusoneclub/app/AGENTS.md
- Relevant Next.js 16.2.9 documentation in node_modules/next/dist/docs for every route, cookie, auth, and server-action pattern you use.
- /Users/adrian/projects/oneplusoneclub/app/docs/events/master-plan.md
- /Users/adrian/projects/oneplusoneclub/app/docs/events/event-operations-agent-briefs.md

Repository safety:
- Work in the existing main checkout.
- Inspect git status and current diffs first.
- Preserve the substantial uncommitted event work already present.
- Do not reset, stash, discard, mass-format, or overwrite unrelated changes.
- You are the only agent allowed to create or edit migrations and database functions.

Product model:
This is a founder-operated event system. Ops actions create and transition events and trigger operational emails. Do not add cron jobs, scheduled workers, or autonomous event-state changes. Store deadlines/due times and enforce member-facing deadlines, but leave operational decisions to founders.

First deliverable — freeze the shared contract:
Before implementing broad UI changes, report to the coordinator and ops agent:
- final event/invitation/seat/payment/delivery fields;
- RPC names, parameters, authorization, and return shapes;
- allowed event transitions;
- email delivery types/statuses;
- public invitation-session and payment result shapes.
Do not rename the contract later without notifying both.

Database and command layer:
1. Extend events with:
   - IANA timezone;
   - invitation_send_at and rsvp_deadline_at;
   - minimum_confirmed_count, default 6;
   - minimum_run_count, default 5;
   - explicit capacity and invitation_limit;
   - venue_confirmed_at, confirmation_released_at, completed_at, cancelled_at, and cancellation_reason;
   - transition audit timestamps required by the ops commands.
2. Preserve current event states but make their meaning explicit:
   - draft: prepared, no invitation emails sent;
   - inviting: founder sent invitations;
   - confirmed: founder released confirmed event details;
   - completed: founder closed the event;
   - cancelled: founder cancelled and notified participants.
3. Separate or explicitly model:
   - invitation response;
   - seat status;
   - payment status;
   - waitlist reason and original priority.
   Migrate existing rows safely and retain compatibility where needed.
4. Add idempotent security-definer commands for ops:
   - prepare_event_from_matching_group;
   - open_event_invitations / record invitation-send transition;
   - confirm_event_and_release_details;
   - cancel_event;
   - assign_event_host;
   - mark_event_completed;
   - record replacement and refund eligibility.
5. prepare_event_from_matching_group must:
   - lock and require a fixed group;
   - return the existing linked event on retry;
   - create one draft event;
   - include active and pending members but reject cancelled members;
   - create one invitation per member;
   - link matching_groups.event_id;
   - create the privacy-safe proposed-group summary;
   - never send email itself.
6. Enforce one event per fixed matching group.
7. Remove hard-coded capacity/deadline behavior from RSVP functions. Capacity comes from the event; RSVP closes at the stored deadline.
8. Keep invitation-then-event lock order consistent in all confirmation/hold/payment functions.

Durable email command records:
1. Create an event email delivery/outbox model that works without a scheduler:
   - event, invitation, member, and triggering admin/action IDs;
   - email type, locale, template ID/version;
   - frozen non-secret event payload;
   - stable idempotency key;
   - draft/sending/sent/failed/cancelled state;
   - attempts, provider message ID, last error, and timestamps;
   - optional due_at for ops display only.
2. A founder/member action creates or claims delivery rows and the server sends them immediately. A failed row remains retryable from ops.
3. Never store a raw payment-resume or invitation bearer token in a delivery row, audit log, preview, pathname, or client payload.
4. Add the data/RPC support needed for these email commands:
   - invitations: member and pending-member branches;
   - member response: confirmed, capacity waitlist, balance waitlist, cancellation received;
   - founder actions: RSVP reminder, event confirmed, event cancelled, host package, event reminder, replacement/refund, no replacement, feedback request;
   - marketing-eligible credit-offer trigger.

Pending-member invitation, payment, and ten-minute hold:
1. Implement the full event-linked flow; do not fall back to an unrelated membership checkout in the finished system.
2. Add hashed invitation access tokens and short-lived invitation sessions.
3. Email entry route:
   - /event-invitation/access?token=... validates server-side;
   - sets HttpOnly, Secure, SameSite=Lax invitation-session cookie;
   - returns a 303 redirect to stable /event-invitation.
4. Never use /event-invitation/[raw-token]; PostHog/history tracking must never receive the bearer token.
5. Public invitation page exposes only date/time, city, language, age range, majority intention, preference nudge, RSVP deadline, and current seat/payment state. No venue before release and no raw matching profiles.
6. Add ten-minute seat holds counted with confirmed seats.
7. Preserve first-application priority after a hold expires.
8. Add an app-owned Stripe membership checkout tied to event, invitation, hold, and member IDs.
9. Extend the app Stripe webhook and success reconciliation so payment:
   - activates membership and grants the joining credit idempotently;
   - renews the event hold when a seat remains available;
   - sends the member through normal login to `/going-out` with the original
     invitation selected;
   - opens the standard confirmation popup so the member can choose the host
     preference and spend or reserve the joining credit exactly once.
10. Duplicate checkout/webhook delivery must never double-credit, double-debit, or create two seats.
11. Payment success distinguishes ready-to-confirm, already confirmed or
waitlisted, payment pending, and failure, then links to normal login with the
original invitation encoded in the validated `/going-out` destination.
12. Enforce active membership consistently in protected app context and every auth callback. Pending invitation sessions never grant protected app access.

Active-member and confirmed-event app:
1. Finish the event page using the current uncommitted event components where appropriate.
2. Before event confirmation show date/time, city, format, age range, language framing, majority intention, credit cost, RSVP deadline, preferences nudge, and “full details after confirmation.”
3. After the founder releases details, show restaurant, address, restaurant image, updated attendee summary, host first name/simple introduction, event instructions, and add-to-calendar.
4. Keep host private contact details hidden.
5. Verify accept, decline, both waitlist reasons, capacity increase effects, cancellation, restoration, and declined reapplication.
6. Immediate member-action emails must use the durable delivery model and stable idempotency.

Host, feedback, and messaging support:
1. Enforce one host per event, record who assigned the host and when, and expose host-only materials in app.
2. Store versioned event-material/PDF links without member data.
3. Add event feedback with overall, questions, restaurant, host, and hosting-experience ratings as applicable; require detail when any supplied rating is one star.
4. Replace attended/host messaging eligibility with:
   - event ended/completed;
   - confirmed, non-cancelled seat;
   - sender submitted feedback.
5. Keep one initial message until the recipient replies; host follows the same rule as everyone.

Verification:
- Add focused database/concurrency tests for event preparation, transition idempotency, deadline, capacity, holds, late payment, duplicate Stripe events, cancellation/replacement/refund, and email-delivery uniqueness.
- Verify bearer tokens never enter analytics, logs, client history, or stored non-secret payloads.
- Run git diff --check, npm run lint, and npm run build.
- Smoke-test English and Spanish active and pending flows in development.
- Record pre-existing failures separately.

Do not:
- Edit ops or website files.
- Add a scheduler or cron job.
- Push a production database migration.
- Commit or push Git.
- Configure or send Loops templates.
- Implement an in-memory or non-atomic seat hold.

Handoff:
- behavior summary;
- exact changed files;
- final database/RPC/state contract;
- migration and environment requirements;
- tests and results;
- remaining blockers.
Then stop for coordinator review.
```

## Copy-paste prompt: ops + email agent

```text
You own the founder-facing event operations system and all Loops delivery commands.

Repository:
/Users/adrian/projects/oneplusoneclub/ops

Read completely before editing:
- /Users/adrian/projects/oneplusoneclub/ops/AGENTS.md
- Relevant Next.js 16.2.9 documentation in node_modules/next/dist/docs for every server-action and route pattern you use.
- /Users/adrian/projects/oneplusoneclub/app/docs/events/master-plan.md
- /Users/adrian/projects/oneplusoneclub/app/docs/events/event-operations-agent-briefs.md
- The final database/RPC/state contract from the app agent before binding actions to it.

Repository safety:
- Work in the existing main checkout.
- Inspect git status first.
- Preserve the unrelated uncommitted A/B-test work.
- Do not reset, stash, discard, mass-format, edit, stage, or commit those unrelated files.
- You do not own the database. Do not create or edit migrations or RPC definitions.

Product model:
This is a founder-operated event system. Every state transition and operational email is initiated by a clear founder action in ops. Do not add cron jobs, scheduled workers, or automatic event state changes. Show deadlines and due actions, but let founders decide and click.

Event control centre:
1. On a fixed matching group, add “Create draft event.”
2. Collect/validate:
   - title and localized content;
   - dinner/brunch;
   - starts_at and ends_at;
   - IANA timezone;
   - city/general location;
   - event language;
   - initial capacity and invitation limit;
   - RSVP deadline;
   - minimum confirmation/run counts;
   - later venue name/address/image;
   - most common relationship-intention story option.
3. Call the idempotent prepare command. Repeating it opens the same event and never duplicates invitations.
4. Event page displays:
   - source group and event state;
   - active/pending and EN/ES invitee counts;
   - age/language/intention summary;
   - missing email/preferences warnings;
   - invitation responses;
   - active holds and payments;
   - confirmed seats and balance;
   - waitlists by reason/priority;
   - cancellations awaiting replacement and refunded replacements;
   - host, materials, feedback, and email delivery status;
   - due and overdue founder actions.

Explicit founder actions:
1. Prepare/review invitations — no send.
2. Send invitations — transitions draft to inviting and sends member/pending branches.
3. Send non-responder reminder.
4. Increase capacity, with confirmation and audit.
5. Confirm event and send details — validates venue/final facts, transitions to confirmed, and sends attendee confirmations.
6. Cancel event and notify participants — shows affected seats/credits, requires explicit confirmation, transitions to cancelled, and sends cancellation emails.
7. Assign host and send host package.
8. Send event reminder.
9. Record replacement, return original credit, and notify the original participant.
10. Send no-replacement notice and expose restore option.
11. Mark event complete.
12. Send feedback request.
13. Trigger the marketing-eligible post-event credit offer.

Each action must:
- validate current state and required data;
- show affected recipient count before execution;
- be idempotent on repeat submission;
- create/use durable delivery rows;
- send immediately server-side;
- record admin audit data;
- expose failed rows and retry-only-failed;
- never silently perform another state transition.

Loops integration:
1. Use server-only API access and the official client if it fits the existing code; otherwise use the existing tested HTTP client pattern.
2. Keep LOOPS_API_KEY server-only.
3. Operational emails are transactionals with addToAudience false.
4. Use stable Idempotency-Key values no longer than 100 characters.
5. Send sequentially or below the 10 requests/second team limit.
6. Handle accepted, retryable failure, suppressed recipient, and duplicate-idempotency 409 explicitly.
7. Never persist or display raw invitation/payment bearer tokens. Mint sensitive links immediately before server-side send, retain only token-record IDs, and redact query strings from logs/errors.
8. Test sends accept an explicit internal recipient and use non-actionable placeholder links or controlled test-member tokens. Never forward a real recipient's bearer link.
9. Reuse copy from the existing Romantic event invitation workflow only as content source. Do not preserve its hard-coded facts, fixed delays, or orchestration.
10. Maintain a typed template map by email type and locale, configured through server environment variables.
11. Support at least:
   - invitation_member;
   - invitation_pending;
   - seat_confirmed;
   - waitlist_balance;
   - waitlist_capacity;
   - invitation_declined;
   - cancellation_received;
   - reservation_cancellation_received;
   - rsvp_reminder;
   - event_confirmed;
   - event_cancelled;
   - host_package;
   - event_reminder;
   - replacement_refund;
   - no_replacement;
   - feedback_request.
12. The promotional credit offer is not transactional. The explicit ops action should send a Loops event into a marketing workflow for eligible contacts, or prepare the appropriate campaign mechanism chosen by the coordinator.
13. Host PDF attachment is optional only when Loops attachments are enabled and the request remains under 4 MB. Always support the public material-link fallback.
14. For `invitation_member`, mint a Supabase magic-link token at send time and set the authenticated destination to `/going-out`. Mark only this invitation link for browser auto-confirmation; expired-link replacement must preserve the Going Out destination. Keep `invitation_pending` on its separate one-time invitation-access flow.

Privacy and content:
- No exact venue/address before the founder confirms and releases details.
- No private compatibility data or individual intention.
- Pending invite makes clear that payment activates membership and the seat outcome is determined by the event-linked hold/payment flow.
- Language copy is English/Spanish and uses event-scoped variables.
- Preview CTA kind and destination while masking all bearer tokens.

Development verification:
- Add unit tests for action authorization, allowed transitions, idempotent repeat actions, exact recipient branches, test-send isolation, partial failure, retry-only-failed, template selection, and secret redaction.
- Exercise the complete founder flow against the development database only.
- Run git diff --check, npm run test:unit, npm run lint, and npm run build.
- Record pre-existing failures separately.

Do not:
- Edit app or website files.
- Edit any migration or RPC definition.
- Add a scheduler or cron job.
- Run supabase db push.
- Commit or push Git.
- Deploy ops.
- Send a production cohort.
- Touch unrelated A/B-test dirty files.

Handoff:
- behavior summary;
- exact changed files;
- required environment/template IDs;
- tests and results;
- founder runbook for every action;
- remaining contract mismatches or blockers.
Then stop for coordinator review.
```

## Coordinator integration, development test, and push

The coordinator owns the work that must not be split between agents.

### Contract and Loops setup

1. Record initial HEAD/status/diff in app, ops, and website.
2. Freeze the app agent's database/RPC/state contract and give it to ops.
3. Create/publish the required English/Spanish Loops templates and save their IDs.
4. Human-review Spanish copy.
5. Verify that operational templates are transactional and the credit offer uses a marketing workflow/event.

### Development integration

1. Review the database migration first.
2. Mirror the final migration byte-for-byte into ops only if required by the deployment workflow.
3. Apply it to the verified development Supabase project only.
4. Configure development Stripe webhook/price and Loops IDs.
5. Deploy or run development app and ops.
6. Test the complete founder flow:
   - create draft from fixed group;
   - preview/send invitations;
   - active accept/decline/waitlist;
   - pending public preview, hold, payment, confirmation/late waitlist;
   - capacity increase;
   - confirm/release details;
   - host assignment/material;
   - cancellation/replacement/refund;
   - complete event, feedback, messaging, and offer trigger.
7. Retry actions and Stripe/Loops callbacks to prove idempotency.
8. Fix release blockers and repeat development simulation.

### Verification commands

App:

```bash
cd /Users/adrian/projects/oneplusoneclub/app
git diff --check
npm run lint
npm run build
```

Ops:

```bash
cd /Users/adrian/projects/oneplusoneclub/ops
git diff --check
npm run test:unit
npm run lint
npm run build
```

Website only if changed:

```bash
cd /Users/adrian/projects/oneplusoneclub/website
git diff --check
npm run build:astro
npm run test:e2e -- tests/e2e/registration-flow.spec.ts
```

### Git push

Do not stage all dirty files indiscriminately.

1. Stage reviewed event-system files in app, including required existing event changes and planning documents. Leave unrelated work untouched.
2. Commit and push app `main`.
3. Stage reviewed event-system files in ops plus the byte-identical migration mirror if required. Exclude unrelated A/B-test work.
4. Commit and push ops `main`.
5. Push website only if it changed and passed its tests.

Git push and production deployment are separate. Code can be pushed after development verification without applying the migration to production.

### Production release

1. Verify the exact production Supabase project.
2. Review the pending migration diff and recovery plan.
3. Apply the migration once under coordinator control.
4. Deploy app, then ops.
5. Configure/verify production Stripe and Loops values.
6. Run controlled internal founder-flow and email tests.
7. Create the real events as drafts.
8. Review the real cohorts and payloads.
9. Use the ops actions to send the real invitations.
