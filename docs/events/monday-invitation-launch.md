# Monday rollout checklist

Rollout date: Monday, 2026-07-20

“Monday” is the rollout date, not a product name or a reduced architecture. The system being delivered is the founder-operated event system in the [events master plan](./master-plan.md). The coding assignments are in the [event-system agent briefs](./event-operations-agent-briefs.md).

The implementation agents receive the durable product requirements, not launch-hour language. This checklist belongs to the coordinator and founders.

## Rollout outcome

Have the complete code needed for founders to operate an event through ops:

1. Create a draft event from a fixed matching group.
2. Review the event, recipients, member branches, and email payloads.
3. Explicitly send invitations.
4. Handle member and pending-member RSVP, payment, ten-minute holds, capacity, and waitlists.
5. Explicitly confirm or cancel the event and send the corresponding emails.
6. Operate hosting, reminders, replacements, credit returns, completion, feedback, messaging, and the credit offer.

No cron job or scheduler is part of this rollout. Ops shows due and overdue actions; a founder decides and clicks. Member actions may trigger their immediate transactional result.

## Work allocation

- **App + database agent:** app UI, pending-member flow, Stripe flow, event state/data model, migrations, RPCs, feedback, and messaging gates.
- **Ops + email agent:** founder control centre, previews, explicit commands, Loops transactional sends, delivery status, and failed-send retry.
- **Coordinator:** freezes the shared contract, configures Loops templates, integrates both repositories, applies the migration to development, runs the complete simulation, and owns commits, pushes, deployments, and real sends.

The app agent is the only migration/RPC author. The ops agent consumes that contract. The repos are already separate working boundaries, so new worktrees are unnecessary for this implementation.

## Code-complete gate

### App and database

- [ ] Event, invitation response, seat, payment, waitlist, host, email-delivery, feedback, and messaging states are represented explicitly.
- [ ] All founder commands are authorized, validated, audited, and idempotent.
- [ ] Event creation from a fixed group includes active and pending members and cannot duplicate the event or invitations.
- [ ] RSVP uses stored capacity and the event-local deadline.
- [ ] Pending-member invitation access uses a short-lived server session and a stable token-free page.
- [ ] Pending-member payment uses an app-owned Stripe Checkout and an atomic ten-minute seat hold.
- [ ] On-time and late payment, capacity, balance, waitlist, duplicate webhook, and credit outcomes are correct.
- [ ] Active and confirmed event pages expose the right facts for each event state and keep sensitive matching data private.
- [ ] Cancellation, replacement-dependent credit return, feedback, and messaging gates work.
- [ ] Operational email delivery records are durable and retryable without requiring a scheduler.

### Ops and Loops

- [ ] Founders can create and edit a draft event from a fixed group.
- [ ] Invitation preview shows counts, member/pending and locale branches, warnings, and masked CTA destinations.
- [ ] “Send invitations” is a separate confirmed action that moves the event to `inviting` and sends immediately.
- [ ] Founders can review responses, holds, payments, confirmed seats, capacity, waitlists, and failed deliveries.
- [ ] Founders can explicitly send reminders, confirm and release details, cancel and notify, assign the host, send materials, operate replacements/refunds, mark complete, request feedback, and trigger the credit offer.
- [ ] Every action validates state, previews impact, records the operator, is safe to retry, and never performs a hidden second transition.
- [ ] Operational email types exist as English and Spanish Loops transactionals with `addToAudience: false`.
- [ ] The promotional credit offer enters a marketing-eligible Loops Workflow only after the founder triggers it.
- [ ] Failed deliveries can be retried without resending successful ones.
- [ ] Raw invitation or payment bearer tokens never enter previews, logs, analytics, or delivery payloads.

## Development-environment setup

- [ ] Record the starting HEAD, status, and diff for app, ops, and website; preserve unrelated work.
- [ ] Freeze the final database/RPC/state/email contract before ops binds to it.
- [ ] Confirm the exact development Supabase project before applying anything.
- [ ] Review and apply the migration to development only.
- [ ] Configure development app and ops with development Supabase, Stripe test mode, webhook, and Loops template IDs.
- [ ] Publish or select the required Loops test templates and human-review Spanish copy.
- [ ] Use only internal test recipients and non-production cohorts.

## Full development simulation

Run this as a founder would operate the system:

1. Create a fixed test group containing active and pending English/Spanish members.
2. Create the draft event in ops and fill all invitation-stage details.
3. Review recipient counts, branches, warnings, event facts, and masked CTAs; confirm that preparation sent nothing.
4. Use the explicit test/send action and verify durable delivery status and safe retry.
5. Test active-member accept, decline, capacity waitlist, balance waitlist, repeated submission, and preference nudge.
6. Test pending-member preview, ten-minute hold, Stripe test payment, membership activation, seat confirmation, expired-hold allocation, and priority waitlist.
7. Verify duplicate actions and Stripe/Loops callbacks do not duplicate seats, credits, invitations, or emails.
8. Increase capacity from ops and verify the resulting view and waitlist behavior.
9. Add venue details, explicitly confirm the event, and verify confirmation emails plus the confirmed-event page.
10. Assign a host, send the host package, and verify host-only in-app materials.
11. Exercise club cancellation and participant cancellation both with and without replacement; verify participant visibility and credit handling.
12. Mark the event complete, explicitly send feedback requests, submit one-star and normal feedback, and verify the messaging gate.
13. Explicitly trigger the eligible credit offer and verify its 48-hour validity without enrolling an ineligible contact.
14. Verify all due actions are visible in ops but none run by themselves.

## Repository verification and push

Run the commands listed in the coordinator section of the [agent briefs](./event-operations-agent-briefs.md). Record pre-existing failures separately and fix every introduced release blocker.

Then:

1. Review and stage only event-system changes in the app repository.
2. Commit and push app `main`.
3. Review and stage only event-system changes in the ops repository, including a byte-identical migration mirror only if the deployment workflow requires one.
4. Commit and push ops `main`.
5. Build and push the website only if this implementation actually changed it.

Pushing code does not authorize a production database migration, deployment, Loops cohort send, or Stripe change.

## Production release and first founder operation

After the development simulation passes:

- [ ] Verify the production Supabase project and review the exact pending migration and recovery plan.
- [ ] Apply the migration once under coordinator control.
- [ ] Deploy app, then ops, and verify production environment variables.
- [ ] Run a controlled internal founder-flow and email test in production.
- [ ] Create the real events as drafts.
- [ ] Review each cohort, event fact, locale branch, and email payload.
- [ ] Have a founder explicitly use “Send invitations” for the real cohort.
- [ ] Watch delivery failures, responses, holds, payments, and waitlists in ops.

The exact real-send time is an operational founder decision. It is not an engineering-agent deadline.

## Go/no-go rule

Go only if the relevant end-to-end development flows pass, recipient counts reconcile, secrets are absent from logs and previews, retries are idempotent, and the founders can see and operate every required action.

If a flow is not safe, do not describe it differently in email copy or silently substitute an unrelated flow. Keep the real event in draft, fix the blocker, rerun the development simulation, and release only after the same founder path passes.
