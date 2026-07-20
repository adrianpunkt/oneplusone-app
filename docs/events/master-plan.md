# Events master plan

Last updated: 2026-07-20

Owner: product/operations with engineering support

Related rollout checklist: [Monday rollout](./monday-invitation-launch.md)

Implementation briefs: [Founder-operated event system agent briefs](./event-operations-agent-briefs.md)

## Purpose

Build the complete operational event lifecycle for one plus one club, from a fixed matching group through invitations, payment, confirmation, hosting, post-event feedback, and member messaging.

This document is the source of truth for scope, dependencies, state, acceptance criteria, and deferred work. The Monday document is only the coordinator's dated rollout checklist; it does not reduce or redefine this system.

## Initial operating principle

The first version is founder-operated through ops. Store the timing rules and show what is due, but do not add cron jobs, scheduled workers, or autonomous event state changes yet.

Founders explicitly:

- Create an event from a fixed matching group.
- Review the event and invitation cohort.
- Send invitations.
- Increase capacity when appropriate.
- Send RSVP reminders.
- Confirm the event and release venue details.
- Cancel the event and notify participants.
- Assign a host and send host materials.
- Trigger event reminders, feedback requests, replacement/refund notices, and the credit offer.

Member actions may send their immediate transactional result, such as seat confirmed, waitlisted, or cancellation received. Every send still uses a durable idempotent delivery record.

Future automation should call the same validated commands founders use in ops. It must not introduce a second event workflow.

## Product decisions already made

- A pending member completed the profile, supplied an email, accepted the applicable terms, but never paid and cannot access the protected member app.
- Pending members remain eligible for matching and event invitations.
- The event invitation should make the club concrete for pending members before asking for payment.
- A pending member who applies for a seat should receive a ten-minute seat hold while paying.
- If payment finishes after the hold expires, membership still activates. The system tries the seat again. A capacity or expired-hold waitlist leaves the joining credit available; a gender-balance waitlist reserves it under the rule below.
- Joining a gender-balance waitlist spends the event credit immediately. Promotion keeps that debit as the event credit payment. If the needed balancing participant is not found, the system returns the credit automatically and notifies the member.
- Joining a capacity waitlist does not spend a credit.
- RSVP closes at 18:00 in the event timezone on Wednesday.
- Six confirmations are required to organize an event. A confirmed event may still run with five after a late cancellation.
- Ops may increase capacity when demand is high. The current operating choices are eight or ten confirmed attendees.
- Invitations may go to a larger candidate pool than the final table capacity.
- Venue reservation remains manual on Thursday morning.
- Event confirmation and venue disclosure happen on Thursday.
- A participant cancellation removes the person from the participant list immediately.
- A participant's event credit is returned only after a replacement confirms.
- If no replacement is found, notify the participant six hours before the event and let them reclaim the place if it is still available.
- There is no separate attendance-taking operation. A confirmed, non-cancelled seat is the attendance proxy.
- Post-event messaging requires the member to submit feedback first.
- Host selection is manual in ops. The host remains a normal participant for messaging.
- Each person may send one initial private message to another attendee; the conversation opens after the recipient replies.
- The post-event credit offer starts 20 hours after the event, lasts 48 hours, and offers three credits for EUR 30 unless an experiment overrides it.
- Exact compatibility, political, religious, and other sensitive matching data remains private.
- Display the cohort's most common relationship-intention option as an aggregate. Never expose which member selected it.
- Never organize multiple one plus one club tables in the same restaurant at the same time.

## Open decisions

These do not block the initial founder-operated rollout unless marked otherwise.

1. **Invitation pool ceiling:** first-wave invitations are 12 per group. Decide whether later waves may bring the lifetime invitation count to 14 or 16. This must not be confused with table capacity.
2. **Club-cancelled event credit:** recommended default is to return every spent event credit automatically when the club cancels the event. Monetary membership refunds remain a separate manual 14-day process.
3. **Below-five late cancellation:** recommended default is an ops alert and manual decision, not automatic event cancellation.
4. **Hosting feedback:** store participant rating of the host separately from the host's rating of their own hosting experience.
5. **Marketing consent:** operational event email may follow from the requested matching service; promotional credit offers require explicit marketing eligibility.
6. **Clear majority:** recommended default is more than 50 percent of the relevant cohort, with at least four source profiles and no percentage shown to members.

## Current foundation

The code already provides:

- Pending and active `members` records.
- Matching groups containing active and pending members.
- A link from a matching group to an event.
- Events, invitations, attendees, capacity, credits, and member preferences.
- Active-member invitation acceptance, decline, cancellation, credit spending, capacity waitlisting, and gender-balance waitlisting.
- Secure payment-resume tokens for pending membership payment.
- Stripe membership completion that activates membership and grants one joining credit idempotently.
- Event questions and per-event question assignment.
- A one-initial-message-until-reply conversation model.
- Loops transactional sending with idempotency.
- Signed Loops webhook ingestion and delivery telemetry.
- English and Spanish app localization infrastructure.

The current foundation does not yet provide a complete event lifecycle. In particular, a single invitation status is being used for response, seat, and payment outcomes; pending members cannot access the event in the app; event timing rules are partly hard-coded; and operational emails are not backed by a durable event-specific outbox.

## Domain model and state

### Event state

```text
draft -> inviting -> confirmed -> completed
                   \-> cancelled
draft/inviting -----------------> cancelled
```

- `draft`: ops is preparing the event and no invitations may be sent.
- `inviting`: a founder used “Send invitations”; the cohort is frozen and RSVP is open.
- `confirmed`: a founder used “Confirm event and send details”; the venue is confirmed and details are released.
- `completed`: a founder marked the event complete; post-event actions may run.
- `cancelled`: a founder used “Cancel event and notify participants”; no seat or messaging access remains.

Store timestamps for every important transition rather than inferring history from `updated_at`.

### Invitation response state

```text
invited -> accepted
        -> declined
        -> expired
```

This expresses the person's decision only.

### Seat state

```text
none -> held -> confirmed -> cancelled -> replaced
            \-> waitlisted
held -> expired -> waitlisted/confirmed
```

Waitlist reason is separate: capacity, gender balance, or payment-hold expiry.

### Payment state

```text
not_required
pending -> paid
        -> failed
        -> expired
```

Do not represent these three state machines with one text column. Migrate the existing combined status safely while preserving compatibility for existing rows and callers during the transition.

## Workstreams

### EVT-01 — event contract and scheduling

Add to `events`:

- IANA `timezone`.
- `invitation_send_at`.
- `rsvp_deadline_at`.
- `minimum_confirmed_count`, default 6.
- `minimum_run_count`, default 5.
- Explicit `capacity`.
- `invitation_batch_size` and/or a clearly named invitation limit.
- `venue_confirmed_at`.
- `confirmation_released_at`.
- `completed_at`.
- `cancelled_at` and `cancellation_reason`.

Requirements:

- Compare deadlines using stored timestamps, while displaying in the stored IANA timezone.
- RSVP closes exactly at 18:00 local event time.
- Capacity and invitation pool are independent.
- Remove hard-coded capacity and invitation limits from database functions.
- Every state transition is audited.

### MATCH-01 — fixed matching group to event

Add an idempotent ops action/RPC that:

1. Locks and validates a fixed matching group.
2. Returns its existing event when already linked.
3. Creates exactly one event.
4. Copies both active and pending group members into event invitations.
5. Links `matching_groups.event_id`.
6. Calculates a privacy-safe proposed-group summary.
7. Prepares, but does not send, invitation deliveries.

Add a one-event-per-matching-group database constraint.

Future matching-tool work:

- Flag a weak-fit member.
- Return the top three replacement candidates with compatibility diagnostics.
- Enforce the operating goal that each person has at least two mutual green matches.
- Keep manual review and override.

### SUM-01 — privacy-safe event summary

Create a summary snapshot for the proposed cohort and another for confirmed attendees:

- Age minimum and maximum.
- Primary event language.
- Other commonly spoken languages.
- Most common relationship-intention option.
- Source cohort size and calculation timestamp.

Rules:

- The invitation stage uses the proposed/fixed-group snapshot.
- Event confirmation uses the confirmed-attendee snapshot.
- The most common submitted story option is displayed; ties resolve deterministically by option text.
- No raw matching answers enter Loops.
- No restaurant or exact address appears before Thursday confirmation.

### INV-01 — active-member invitation and RSVP

Member event page must show:

- Date and time.
- City/general location.
- Event format.
- Age range.
- Event language and additional-language framing.
- Majority intention phrased as an aggregate.
- Credit cost.
- RSVP deadline.
- Pending venue message until Thursday.
- A branded dinner or brunch image until the confirmed restaurant image is available.
- Going-out-preferences reminder when incomplete.

Actions:

- Accept.
- Decline with the agreed reason set.
- Join the appropriate waitlist.
- Add confirmed event to calendar.
- Cancel a confirmed seat.

Requirements:

- Preserve the requested event through login using a validated `next` path.
- Capacity and balance checks are atomic.
- App and email use identical event facts.

### PAY-01 — pending-member invitation access

Create an invitation-only public experience outside the protected member app:

1. Email opens `/event-invitation/access?token=...`.
2. Server hashes and validates the token.
3. Server sets an HttpOnly, Secure, SameSite=Lax invitation session.
4. Server returns a 303 redirect to stable `/event-invitation`.
5. Stable page renders only whitelisted event summary fields.

Never put the raw bearer token in a stable client-rendered pathname. Analytics history tracking could otherwise capture it.

Pending invitation access does not grant access to member routes. Protected member context and every auth callback must reject or sign out pending memberships consistently.

### PAY-02 — ten-minute seat hold and membership payment

Create:

- Hashed invitation access tokens and short-lived invitation sessions.
- `event_seat_holds`.
- `event_invitation_payment_attempts`.
- Atomic begin-payment and complete-payment RPCs.

Flow:

1. Pending member applies for a seat.
2. Database locks invitation then event and creates a ten-minute hold when eligible.
3. App creates Stripe Checkout with event, invitation, hold, and member identifiers in metadata.
4. Stripe webhook activates membership and grants the joining credit idempotently.
5. If the hold is valid, confirm and spend the credit.
6. If the hold expired, try current availability.
7. If unavailable, preserve original priority and waitlist. Leave the credit unspent for capacity or expired-hold waitlisting; reserve it for gender-balance waitlisting.

Requirements:

- Confirmed seats plus unexpired holds cannot exceed capacity.
- Duplicate payment clicks create no duplicate active holds.
- Duplicate Stripe events grant and spend no duplicate credits.
- Checkout cancellation releases or expires the hold.
- A paid membership is never rolled back merely because the event filled.
- App owns the final integrated event-membership checkout to avoid cross-domain session coupling.

### WAIT-01 — capacity, balance, and promotion

- Persist `waitlist_reason`.
- Persist `priority_at` from the first application.
- Present distinct capacity and gender-balance messages.
- Spend the event credit when a member accepts a gender-balance waitlist position. Do not spend it for capacity or payment-hold-expiry waitlists.
- Keep the balance-waitlist debit when the member is promoted. Return it idempotently if the event is finalized without the balancing participant, the club cancels, or the member leaves that waitlist before promotion.
- Promote eligible waitlisted people atomically when capacity/balance changes.
- Do not displace a confirmed attendee based on an earlier late payment.
- Allow ops to expand capacity from 8 to 10 before the RSVP deadline.
- Record every promotion and notification.

### CONF-01 — Wednesday threshold and Thursday confirmation

Wednesday at 18:00 event-local time:

- Close RSVP.
- Count confirmed seats.
- If fewer than 6, show a blocking ops warning and make the founder choose whether to cancel.
- If at least 6, show the event as ready for the manual venue reservation step.

Thursday:

- Ops makes the reservation manually.
- Ops enters venue name, address, image, final time, and final attendee summary.
- Ops confirms the event and releases details.
- System sends attendee confirmation and the host package.

Attendee confirmation includes the restaurant, exact location, updated age range, primary and additional-language framing, final time, and the host's first name/simple public introduction. It does not include private host contact information.

Do not automate restaurant reservation in the first version.

### CAN-01 — participant cancellation and replacement

On cancellation:

- Remove member from participant directory immediately.
- Mark seat as awaiting replacement.
- Attempt eligible waitlist promotion.
- Link replacement invitation to original cancellation.
- Return the original credit only when the replacement confirms.
- Send a replacement/refund notification.
- At event minus six hours, if unreplaced, send the no-replacement message and restoration option.
- If the person restores before replacement, reuse the existing spent credit rather than charging another.
- When a late cancellation materially affects the event, notify the host; if there is no host, use the agreed attendee-wide operational notice.

Create explicit replacement records and do not infer the relationship only from credit-ledger notes.

### HOST-01 — host selection and playbook

Ops:

- Select exactly one host manually.
- Record who assigned the host and when.
- Do not expose private host contact details.

Host material:

- English and Spanish versions.
- Instructions shown in the app under a host-only section.
- Printable PDF with detachable instructions and cut-up questions.
- Public, unguessable or deliberately public asset URL containing no member data.
- Attach to Loops transactional email when attachments are enabled; always keep the link fallback.

Playbook:

1. Print or write the questions.
2. Arrive ten minutes early.
3. Run introductions when everyone arrives or after 30 minutes.
4. Run sharing when everyone has a drink or around one hour.
5. Run spicy questions when food arrives or around 90 minutes.

Brunch uses lower-intensity questions. Dinner may use higher levels.

### EMAIL-01 — operational delivery architecture

Create an event email outbox/delivery table with:

- Event, invitation, and member IDs.
- Email type and locale.
- Frozen non-secret payload JSON.
- Loops transactional/workflow ID.
- Stable idempotency key.
- Scheduled time.
- Draft/sending/sent/failed/cancelled state.
- Attempt count, provider message ID, last error, and timestamps.
- Template version.

Operational event messages are action-triggered Loops transactionals. The action may be a member response or an explicit founder control in ops:

- Member invitation.
- Pending-member/payment invitation.
- RSVP reminder.
- Seat confirmation.
- Gender-balance waitlist.
- Capacity waitlist.
- Cancellation confirmation.
- Replacement found and credit returned.
- No replacement at event minus six hours.
- Club cancellation.
- Thursday event confirmation.
- Event reminder with location.
- Host package.
- Late participant-cancellation notice to the host or attendees, when operationally required.
- Post-event feedback request.

Loops Workflow:

- The founder clicks the due credit-offer action in ops; the app emits an event into a workflow that sends the promotional offer.
- Only marketing-eligible contacts enter this workflow.
- Offer link is valid until event plus 68 hours.

Loops Campaign:

- Newsletter and broad one-off announcements.

Rules:

- Use `addToAudience: false` for operational transactionals.
- Reuse a stable idempotency key on ambiguous retries.
- Never store a raw payment-resume or invitation bearer token in the outbox, audit log, preview, or provider telemetry. Mint sensitive links just-in-time for the server-side send and retain only their token-record IDs.
- Test sends cannot target the production cohort.
- Preview recipient, branch, variables, and CTA before sending.
- Retry only failed deliveries.
- Keep event facts in event-scoped payloads, not mutable contact properties.
- Maintain a manual export/send fallback for the pilot.
- Do not add a scheduler in the first implementation. Store `due_at`, show overdue actions in ops, and require a founder click.

### EMAIL-02 — email content inventory

Build and approve in English and Spanish:

1. Member invitation.
2. Pending-member invitation/payment.
3. Seat confirmed.
4. Gender-balance waitlist.
5. Capacity waitlist.
6. Cancellation received.
7. Non-responder reminder, 24 hours after invitation or at the configured safe time.
8. Club cancellation for minimum not reached.
9. Thursday event confirmation.
10. Event reminder, currently planned for 12 hours before the event.
11. Host package.
12. Replacement found and credit returned.
13. No replacement at six hours before the event.
14. Late participant-cancellation notice to host or attendees when needed.
15. Post-event feedback at three hours after the event.
16. Credit offer at 20 hours after the event.

The existing Loops workflow copy may be reused, but hard-coded event facts and fixed orchestration must not be copied.

### POST-01 — feedback

Create one feedback record per event/member with:

- Overall rating, 1–5.
- Questions rating, 1–5.
- Restaurant rating, 1–5.
- Host rating, 1–5, when applicable.
- Hosting-experience rating, 1–5, for the host when applicable.
- Additional comments.
- One-star detail.
- Submitted timestamp.

If any supplied rating is one star, require explanatory text before submission.

Send the feedback request three hours after event end. Also surface it in the app so email suppression or delivery failure does not permanently block the member.

### POST-02 — messaging gate

Replace the current `attended/host` requirement with:

- Event ended or completed.
- Sender had a confirmed seat and did not cancel.
- Sender submitted event feedback.
- Recipient had a confirmed seat and did not cancel.

The recipient does not need to submit feedback for the sender to create one initial message, but the recipient must submit their own feedback before opening their participant directory and messaging UI.

Keep:

- One conversation per unordered attendee pair per event.
- One initial message from the initiator.
- Conversation opens when the recipient replies.
- Host follows the same rule as everyone else.

### OFFER-01 — post-event credit offer

- Three credits for EUR 30.
- Starts event plus 20 hours.
- Expires 48 hours later.
- Marketing-eligible recipients only.
- Offer record or signed link must enforce start, expiry, member, product, and idempotent redemption.
- Record conversion by event and offer version.

### OPS-01 — event control centre

Ops event page should show:

- Event facts and state.
- Source matching group.
- Active versus pending invitees.
- Locale counts.
- Missing going-out preferences.
- Invitation response counts.
- Active holds.
- Confirmed seats by gender balance.
- Waitlist by reason and priority.
- Cancellations awaiting replacement.
- Refunded/replaced cancellations.
- Email preparation and delivery status.
- Host selection.
- Question/material assignment.
- Threshold and venue checklist.
- State-transition audit log.

Founder controls:

- Create draft event from fixed group.
- Prepare/review invitations.
- Send invitations.
- Send non-responder reminder.
- Increase capacity.
- Confirm event and send venue details.
- Cancel event and notify participants.
- Assign host and send host package.
- Send event reminder.
- Record replacement and return credit.
- Send no-replacement notice.
- Mark event complete.
- Send feedback request.
- Trigger marketing-eligible credit offer.

High-risk actions require preview and explicit confirmation: production invitation send, event cancellation, Thursday detail release, and manual credit/refund override.

### VENUE-01 — venue operations

- Maintain a reviewed shortlist by city, format, capacity, noise level, groupable-table layout, menu price, and opening status.
- Current Valencia candidates include Tagomago, La Brusqueria, and Sauna Valencia; confirm availability and suitability before use.
- Keep at least one backup venue per event.
- Never disclose the selected restaurant before Thursday release.
- Never place multiple club tables in the same restaurant at the same time.
- Reservation remains a manual ops call until the pilot process is stable.

### SAFETY-01 — event safety and policy

- Add terms language prohibiting uninvited guests.
- Host feedback can report an uninvited guest.
- Ops may remove a member for refusing to comply.
- Do not over-engineer physical guest verification for the pilot.
- Do not disclose attendee contact details.
- Avoid event bearer tokens in analytics, logs, referrers, and client history.
- Restrict invitation/session tables to service role.

### OBS-01 — audit, metrics, and support

Track:

- Invitation prepared/sent/failed.
- Invitation page opened.
- Accept/decline/waitlist.
- Pending-member payment started/completed.
- Hold created/expired/converted.
- Capacity expansion.
- Event threshold reached/failed.
- Cancellation/replacement/refund.
- Feedback completion.
- Messaging unlock and first-message conversion.
- Credit-offer conversion.

Operational dashboards must be usable without relying on Loops open/click tracking because Loops transactionals do not provide those engagement metrics.

## Implementation sequence

M0 through M4 are dependency-ordered parts of the initial code delivery, not separate promises to automate or ship later. M5 is secondary work after founders can operate the full event lifecycle.

### M0 — event creation and invitations

The dated release procedure is in the [Monday rollout checklist](./monday-invitation-launch.md).

### M1 — Wednesday decision support

- RSVP deadline enforced.
- Non-responder reminder.
- Counts and waitlists reliable.
- Ops can expand capacity to 10.
- Minimum-six decision view.
- Club-cancellation draft ready.

### M2 — event confirmation and hosting

- Venue fields and final summary.
- Confirmation release action.
- Attendee confirmation email.
- Host selection and host material link.
- Event reminder shown as due and available for a founder to send.

### M3 — event-day cancellation resilience

- Founder-operated eligible replacement selection and promotion.
- Replacement-dependent credit return.
- Event-minus-six-hours no-replacement notification and restore action.
- Participant directory excludes cancellations.

### M4 — post-event

- Feedback request shown as due at plus three hours and sent by a founder action.
- Messaging gate based on confirmed/non-cancelled seat plus feedback.
- Host treated as participant.
- Credit offer shown as due at plus 20 hours, triggered by a founder, and valid 48 hours.

### M5 — deferred automation, experiments, and scale

- Replacement suggestions in matching tool.
- Automated PDF generation/versioning.
- Same-gender meetup pilot.
- Male-member preference nudge experiment.
- Clarify pet-allergy deal-breaker wording and define the website distance threshold.
- City/pricing experiments.
- Automated venue workflows only after manual operations are stable.

## Verification strategy

Database concurrency tests:

- Concurrent confirmations never exceed capacity or balance policy.
- Unexpired holds count; expired holds do not.
- Duplicate payment and email events are idempotent.
- RSVP closes at the exact event-local deadline.
- Cancellation/refund/replacement cannot double-credit.

Application tests:

- Active and pending invitation branches in English and Spanish.
- Protected app denies pending memberships.
- Bearer token is absent from stable URL, client analytics, and logs.
- Event facts agree across ops, app, email, and calendar.
- Venue remains hidden until Thursday release.
- Cancelled members disappear from participant directory and messaging eligibility.

Operational simulations:

- Six, eight, and ten-person outcomes.
- Low response and event cancellation.
- Capacity and gender-balance waitlists.
- Payment within and after the hold.
- Duplicate Stripe webhook.
- Participant cancellation with and without replacement.
- Host cancellation.
- Loops partial delivery failure and safe retry.
- English/Spanish mobile and desktop test sends.

## Deployment and repository coordination

There are three independent repositories:

- `/Users/adrian/projects/oneplusoneclub/app`
- `/Users/adrian/projects/oneplusoneclub/ops`
- `/Users/adrian/projects/oneplusoneclub/website`

All currently have uncommitted work. The app also has substantial uncommitted event-flow work and new migrations.

Rules:

- One database owner controls all migration and RPC contracts.
- Shared migrations are authored once, then mirrored deliberately where required.
- Never run a production database push from an ambiguously linked checkout.
- Freeze SQL/RPC and email payload contracts before parallel UI work.
- Assign file allowlists to every coding agent.
- The integrator owns already-modified shared files such as app types and dictionaries.
- Run baseline checks before implementation so existing failures are not blamed on new work.
- Preserve all unrelated uncommitted changes.

For the initial implementation, use the existing main worktrees with one owner per repository. After the current changes are checkpointed, later isolated features may use separate `codex/` worktrees. Do not create worktrees from an old HEAD that omits the current event work.
