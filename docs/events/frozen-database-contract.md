# Frozen event database and RPC contract

Frozen: 2026-07-19

Owner: app + database agent

Consumers: member app, founder ops, server-side email delivery commands

The assignment that commissioned this contract supersedes the older five-minute
hold language in the planning documents. Event-linked payment holds are ten
minutes. This contract is founder-operated: `due_at` values are display data and
no command below runs from a scheduler.

## Authoritative records

### `public.events`

Existing fields remain. The final fields used by the event system are:

- Identity/content: `id`, `matching_group_id`, `title`, `description`,
  `localized_content`, `event_format`, `language_code`, `member_notes`,
  `event_instructions`, `restaurant_image_url`.
- Place/time: `starts_at`, `ends_at`, `timezone` (IANA), `city`, `venue_name`,
  `venue_address`.
- Operating limits: `capacity` (required, default 8), `invitation_limit`
  (required, default 12), `credit_cost` (required, default 1),
  `minimum_confirmed_count` (required, default 6), `minimum_run_count`
  (required, default 5), `gender_balance_enabled`.
- Deadlines/due times: `invitation_send_at`, `rsvp_deadline_at`.
- State and audit: `status`, `prepared_at`, `invitations_opened_at`,
  `venue_confirmed_at`, `confirmation_released_at`, `completed_at`,
  `cancelled_at`, `cancellation_reason`, `created_at`, `updated_at`.

`matching_group_id` is unique when present. `ops.matching_groups.event_id` is
also unique when present, and preparation writes both sides while holding the
matching-group row lock.

### `public.event_invitations`

The authoritative state fields are:

- `response_status`: `invited | accepted | declined | expired`.
- `seat_status`: `none | held | confirmed | waitlisted | cancelled | replaced`.
- `payment_status`: `not_required | pending | paid | failed | expired`.
- `waitlist_reason`: null or `capacity | balance | payment_hold_expired`.
- `priority_at`: the first seat-application time; it never moves on retry or
  after an expired hold.
- `member_status_at_invite`: `active | pending`.
- Audit: existing `invited_at`, `responded_at`, `confirmed_at`, `cancelled_at`,
  plus `held_at`, `waitlisted_at`, `payment_completed_at`, `created_at`,
  `updated_at`.

The existing `status` column remains as a compatibility projection:

- confirmed seat -> `confirmed`
- waitlisted seat -> `waitlisted`
- cancelled/replaced seat -> `cancelled`
- declined response -> `declined`
- expired response -> `expired`
- otherwise -> `invited`

Legacy callers that update only `status` are mapped into the authoritative
fields during the compatibility period.

### Holds, payments, replacements, host, materials, feedback

- `event_seat_holds`: `id`, `event_id`, `invitation_id`, `member_id`,
  `priority_at`, `status (active|converted|expired|released)`, `expires_at`,
  `converted_at`, `released_at`, timestamps. There is one active hold per
  invitation; confirmed seats plus unexpired active holds may not exceed event
  capacity.
- `event_invitation_payment_attempts`: event/invitation/hold/member IDs,
  stable `idempotency_key`, Stripe checkout/payment IDs, status
  `created|checkout_created|paid|failed|cancelled`, failure and timestamps.
  Checkout session ID and payment intent ID are unique when present.
- `stripe_event_receipts`: one row per Stripe event ID, used to make webhook
  delivery idempotent.
- `event_replacements`: cancelled and replacement invitation IDs, state
  `eligible|replaced|no_replacement|restored`, `refund_eligible_at`,
  `replaced_at`, `refunded_at`, actor/action IDs, timestamps. An invitation can
  be the source or replacement only once per event.
- `event_reservation_cancellations`: one row for each accepted seat or waitlist
  cancellation, with invitation/event/member IDs, previous seat and waitlist
  state, a required structured reason, optional detail (maximum 500
  characters), the credit outcome acknowledged at cancellation time, and the
  creation timestamp. Later replacement resolution remains in
  `event_replacements`.
- `event_hosts`: one row per event, with member/invitation, public introduction,
  assigning admin/action and `assigned_at`. Private contact fields are absent.
- `event_materials`: event, locale, kind, version, public URL, created action and
  timestamps. URLs contain no member data.
- `event_feedback`: one row per event/member with overall, questions,
  restaurant, host and hosting-experience ratings, comments, one-star detail,
  and `submitted_at`. Any supplied rating of one requires one-star detail.
- `event_summary_snapshots`: one row for each `proposed` and `confirmed` stage,
  containing only age min/max, primary/additional languages, the most common
  relationship-intention story option (stored in `majority_intention` for
  compatibility), source count, and calculation time.

### Commands and durable email deliveries

`event_action_runs` stores the stable action ID/idempotency key, event, command
type, actor admin/member, status, non-secret parameters/result, and timestamps.

`event_email_deliveries` stores event, invitation, member, triggering admin,
member and action IDs; `email_type`, locale, template ID/version, frozen
non-secret payload, optional invitation-access-token record ID, stable
idempotency key (maximum 100 chars), `due_at`, status, attempts, provider
message ID, last error and all claim/send/fail/cancel timestamps.

Delivery statuses are exactly `draft | sending | sent | failed | cancelled`.

Delivery types are exactly:

`invitation_member`, `invitation_pending`, `seat_confirmed`,
`waitlist_capacity`, `waitlist_balance`, `waitlist_balance_released`,
`cancellation_received`, `reservation_cancellation_received`,
`rsvp_reminder`, `event_confirmed`, `event_cancelled`, `host_package`,
`event_reminder`, `replacement_refund`, `no_replacement`,
`late_cancellation_notice`, `feedback_request`, `credit_offer`.

`credit_offer` is only prepared for marketing-eligible members and is consumed
by the ops marketing workflow; it is not a transactional delivery.

No raw invitation token, invitation-session secret, payment-resume token or
secret-bearing URL may appear in a delivery, action row, audit row, frozen
payload, preview, pathname, log, analytics event, or client DTO.

## RPC contract

All ops RPCs are `security definer`, executable only by `service_role`, and
validate `p_admin_id` + `p_admin_email` against an active `owner` or `admin` in
`ops.ops_admin_users`. Every mutation accepts `p_idempotency_key text`, creates
or reuses an `event_action_runs` row, and returns the same result on retry.

### Founder commands

- `prepare_event_from_matching_group(p_matching_group_id uuid, p_title text,
  p_description text, p_localized_content jsonb, p_event_format text,
  p_starts_at timestamptz, p_ends_at timestamptz, p_timezone text, p_city text,
  p_language_code text, p_capacity integer, p_invitation_limit integer,
  p_invitation_send_at timestamptz, p_rsvp_deadline_at timestamptz,
  p_minimum_confirmed_count integer, p_minimum_run_count integer,
  p_admin_id uuid, p_admin_email text, p_idempotency_key text)` ->
  `{ok, actionId, eventId, matchingGroupId, status:'draft', created,
  invitationCount, summary}`. Requires a locked `fixed` group; cancelled members
  reject the whole command; active and pending members each get one invitation;
  retry returns the linked event; no email is sent.
- `open_event_invitations(p_event_id uuid, p_admin_id uuid,
  p_admin_email text, p_idempotency_key text)` -> `{ok, actionId, eventId,
  status:'inviting', transitioned, deliveryCount}`. Draft-only except idempotent
  retry. It records the actual open/send transition and prepares member versus
  pending invitation deliveries.
- `set_event_capacity(p_event_id uuid, p_capacity integer, p_admin_id uuid,
  p_admin_email text, p_idempotency_key text)` -> `{ok, actionId, eventId,
  capacity, previousCapacity, promotedCount, deliveryCount}`. Capacity can only
  increase before the stored RSVP deadline; promotions retain `priority_at`.
- `confirm_event_and_release_details(p_event_id uuid, p_venue_name text,
  p_venue_address text, p_restaurant_image_url text, p_starts_at timestamptz,
  p_ends_at timestamptz, p_event_instructions text, p_member_notes text,
  p_admin_id uuid, p_admin_email text, p_idempotency_key text)` -> `{ok,
  actionId, eventId, status:'confirmed', transitioned, confirmedCount,
  deliveryCount}`. Requires `inviting`, venue/final facts, and the configured
  minimum confirmation count; it freezes the confirmed summary and releases
  details.
- `cancel_event(p_event_id uuid, p_reason text, p_admin_id uuid,
  p_admin_email text, p_idempotency_key text)` -> `{ok, actionId, eventId,
  status:'cancelled', transitioned, affectedSeatCount, refundedCreditCount,
  deliveryCount}`. Draft/inviting/confirmed only; repeat is idempotent. Spent
  event credits are returned once for a club cancellation.
- `assign_event_host(p_event_id uuid, p_member_id uuid, p_public_intro text,
  p_admin_id uuid, p_admin_email text, p_idempotency_key text)` -> `{ok,
  actionId, eventId, hostMemberId, assignedAt, deliveryCount}`. The host must
  have a confirmed non-cancelled seat. Repeating the same assignment is safe;
  replacing a different host is an explicit new action.
- `mark_event_completed(p_event_id uuid, p_admin_id uuid, p_admin_email text,
  p_idempotency_key text)` -> `{ok, actionId, eventId, status:'completed',
  transitioned, completedAt}`. Confirmed-only except idempotent retry.
- `record_event_replacement(p_cancelled_invitation_id uuid,
  p_replacement_invitation_id uuid (nullable for the founder's explicit
  no-replacement decision), p_refund_eligible boolean,
  p_admin_id uuid, p_admin_email text, p_idempotency_key text)` -> `{ok,
  actionId, eventId, replacementId, status, creditRefunded, deliveryCount}`.
  Both invitations lock before the event when a replacement is supplied. Credit
  is returned once only after a replacement has a confirmed seat and refund
  eligibility is true; null records `no_replacement` and queues that notice.

### Delivery commands

- `prepare_event_email_deliveries(p_event_id uuid, p_email_type text,
  p_due_at timestamptz, p_admin_id uuid, p_admin_email text,
  p_idempotency_key text)` -> `{ok, actionId, eventId, emailType,
  deliveryCount, deliveryIds}`. It selects only the branch-eligible recipients
  and uses a stable unique key per logical recipient/send.
- `claim_event_email_delivery(p_delivery_id uuid, p_action_id uuid,
  p_template_id text)` ->
  `{ok, deliveryId, status:'sending', emailType, recipientEmail, locale,
  templateId, templateVersion, idempotencyKey, payload, invitationAccessTokenId,
  invitationAccessToken?, attempts}`. Only `draft` or `failed` can be claimed.
  The immediate sender supplies the resolved Loops transactional ID or workflow
  event name, which is persisted for provider-level auditing. Founder deliveries
  require their matching action ID; member-triggered deliveries use a null action
  ID and must have `triggered_by_member_id` set.
  For `invitation_pending`, the optional access token is generated and returned
  once to the service-side immediate sender during the claim; it is never
  stored. The token ID is not a bearer token.
- `record_event_email_delivery_result(p_delivery_id uuid, p_action_id uuid,
  p_succeeded boolean, p_provider_message_id text, p_error text)` -> `{ok,
  deliveryId, status:'sent'|'failed', attempts, retryable}`.

### Active-member RPCs

`confirm_event_invitation`, `join_event_waitlist`,
`decline_event_invitation`, `cancel_event_confirmation`, and
`restore_cancelled_event_confirmation` keep their existing names. They require
an authenticated **active** member who owns the invitation, enforce the stored
RSVP deadline and event capacity atomically, lock invitation then event, create
the immediate durable delivery, and return:

`{ok, invitationId, eventId, responseStatus, seatStatus, paymentStatus,
waitlistReason, priorityAt, deliveryId}`.

`cancel_event_confirmation(p_invitation_id uuid, p_reason text,
p_details text)` requires a valid structured reason, stores the optional detail
transactionally with the seat change, and additionally returns
`cancellationId`, `cancellationReason`, and `creditOutcome`. Confirmed-seat
cancellations acknowledge `replacement_pending`; balance-waitlist departures
acknowledge and email the automatic refund; other waitlist departures confirm
that no credit was used.

`submit_event_feedback(p_event_id uuid, p_overall_rating integer,
p_questions_rating integer, p_restaurant_rating integer, p_host_rating integer,
p_hosting_experience_rating integer, p_comments text, p_one_star_detail text)`
requires an active member with a confirmed non-cancelled seat after event end or
completion and returns `{ok, eventId, feedbackId, submittedAt}`.

### Invitation-session and payment RPCs

These are `security definer`, executable only by `service_role`. Raw secrets are
returned only to the server route that immediately sets the cookie or sends the
email.

- `create_event_invitation_access_token(p_invitation_id uuid,
  p_action_id uuid, p_ttl_minutes integer)` -> `{ok, tokenId, token,
  expiresAt}`. Access-token expiry is capped at the event RSVP deadline.
- `claim_event_invitation_access_token(p_token text,
  p_session_ttl_minutes integer)` -> `{ok, sessionToken, maxAgeSeconds,
  expiresAt}`. The bearer token is one-use and stored only as SHA-256; claims
  after the RSVP cutoff return `status:'deadline_passed'`. The public email URL
  first performs a non-consuming preflight: a valid token renders the Continue
  form, while a used or expired token immediately queues its idempotent
  replacement and shows the resulting status. The valid-token form posts when
  the visitor continues or after a two-second browser delay, so GET-only
  automated email-link checks cannot consume an active token.
- `refresh_expired_event_invitation_link(p_token text)` -> `{ok, status,
  deliveryId?, locale?}`. A used or expired pending-member link queues at most
  one replacement invitation delivery while the event is open. After the
  stored RSVP cutoff it returns `status:'deadline_passed'` and never queues a
  replacement.
- `resolve_event_invitation_session(p_session_token text)` -> internal server
  result `{ok, sessionId, eventId, invitationId, memberId, email, locale,
  membershipStatus, responseStatus, seatStatus, paymentStatus,
  waitlistReason, priorityAt, expiresAt}`.
- `begin_event_invitation_payment(p_session_token text,
  p_idempotency_key text)` -> `{ok, status, paymentAttemptId, eventId,
  invitationId, memberId, email, locale, holdId, holdExpiresAt, priorityAt}`.
  `status` is `checkout_required | confirmed | waitlisted | closed`. Pending
  checkout creates/reuses a ten-minute database hold. Lock order is invitation,
  then event.
- `prepare_active_event_invitation_resume(p_session_token text)` -> `{ok,
  status, eventId, invitationId, email, holdId?, holdExpiresAt?, priorityAt?}`.
  If the invited person became an active member through another payment path,
  it avoids a second checkout, renews or creates the short seat hold when one
  is available, and restores the invitation to the normal in-app confirmation
  state. Already confirmed, waitlisted, or closed invitations remain terminal.
- `attach_event_checkout_session(p_payment_attempt_id uuid,
  p_checkout_session_id text)` -> `{ok, paymentAttemptId, checkoutSessionId,
  status:'checkout_created'}`.
- `complete_event_invitation_payment(p_payment_attempt_id uuid,
  p_checkout_session_id text, p_payment_intent_id text,
  p_stripe_event_id text)` -> `{ok, eventId, invitationId, memberId,
  membershipStatus:'active', status, seatStatus, paymentStatus,
  waitlistReason, creditAvailable, loginNext}`. `status` is `ready_to_confirm |
  membership_active | confirmed | waitlisted | payment_pending | failed`. It
  activates membership and grants the joining credit once, renews the event
  hold when possible, and returns an actionable invitation to the member app.
  The normal authenticated confirmation RPC then allocates the seat or
  waitlist position, records the host preference, and spends or reserves the
  credit exactly once.
- `get_event_invitation_payment_result(p_session_token text,
  p_checkout_session_id text)` -> the public payment-result DTO below.
- `decline_pending_event_invitation(p_session_token text, p_reason text,
  p_details text)` -> `{ok, eventId, responseStatus:'declined',
  seatStatus:'none', paymentStatus, waitlistReason:null}`. It is service-only,
  validates the short-lived invitation session, locks invitation then event,
  releases any hold, and creates the durable cancellation acknowledgement.
  Pending members also have the distinct `event_type_not_interested` reason so
  operations can separate event-format preference from a one-off event mismatch.
  That reason disables future event invitations for the member; every other
  decline reason leaves the invitation preference unchanged.

## Allowed event transitions

- `draft -> inviting | cancelled`
- `inviting -> confirmed | cancelled`
- `confirmed -> completed | cancelled`
- `completed` and `cancelled` are terminal
- repeating the command that produced the current terminal/target state with
  the same idempotency key returns its original result; no RPC performs a
  reverse or implicit transition.

## Public DTOs

The stable `/event-invitation` page receives only:

```ts
type PublicInvitationSession = {
  ok: true
  event: {
    id: string
    startsAt: string
    endsAt: string | null
    timezone: string
    city: string | null
    eventFormat: "dinner" | "brunch" | "other"
    languageCode: "en" | "es" | null
    capacity: number
    ageRange: { min: number | null; max: number | null }
    majorityIntention: string | null
    additionalLanguages: string[]
    preferenceNudge: boolean
    genderBalanceEnabled: boolean
    rsvpDeadlineAt: string
    creditCost: number
  }
  invitation: {
    responseStatus: "invited" | "accepted" | "declined" | "expired"
    seatStatus: "none" | "held" | "confirmed" | "waitlisted" | "cancelled" | "replaced"
    paymentStatus: "not_required" | "pending" | "paid" | "failed" | "expired"
    waitlistReason: "capacity" | "balance" | "payment_hold_expired" | null
    priorityAt: string | null
  }
  canApply: boolean
  locale: "en" | "es"
}
```

Venue, address, restaurant image, host details, member IDs/emails and raw
matching profiles are never present in this DTO.

Payment success receives only:

```ts
type PublicEventPaymentResult = {
  ok: boolean
  status: "confirmed" | "waitlisted" | "ready_to_confirm" |
    "membership_active" | "payment_pending" | "failed"
  eventId: string
  seatStatus: "confirmed" | "waitlisted" | "held" | "none"
  paymentStatus: "pending" | "paid" | "failed" | "expired"
  waitlistReason: "capacity" | "balance" | "payment_hold_expired" | null
  creditAvailable: boolean
  loginNext: string
}
```

`loginNext` is `/going-out?apply=<invitation-id>` while confirmation can resume,
and `/going-out` for already completed or terminal outcomes. It is passed
through the existing validated member-login `next` normalizer.
