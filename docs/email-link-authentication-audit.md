# Email link and authentication-token audit

Audited: 30 July 2026

Status: report only; no token lifetime, email template, workflow, or application behavior was changed.

## Scope and method

This audit covers:

- the member app in `app`;
- founder and event operations in `ops`;
- signup, payment, and support flows in `website`;
- the live Loops team, including 56 transactional definitions, 54 published transactional emails, and 40 workflow email messages across four workflows.

The live Loops catalog currently has two sending workflows:

- `Warm lead, didn't pay`;
- `New paid member`.

It also has two draft workflows:

- `Romantic event invitation`;
- `Emails to active men "not sure" status`.

Token behavior was traced through the current application code, Supabase Auth configuration, and the latest database migrations in the three repositories. No real token values or recipient data were collected. The Loops catalog is live team-level state; database semantics were verified from the current repositories and configuration rather than by inspecting production token rows.

Third-party emails that may be sent independently by Stripe, Supabase, or another provider are outside the inventory unless the app explicitly triggers or supplies the link. The Supabase fallback login email is included because the app can deliberately invoke it.

## Executive summary

The most urgent findings are:

1. **Warm-lead payment CTAs are currently malformed.** `paymentResumeUrl` already contains `?token=...`, but the live Loops messages append `?utm_source=...`. The resulting `token` parameter is `TOKEN?utm_source=...`, so it does not match the stored token hash. The expired-link recovery also cannot recover this altered token.
2. **The warm-lead token is much shorter than the workflow.** With current defaults it expires 1,455 minutes after story submission. The first email is sent after 10 minutes, the second after one day and 10 minutes with about five minutes left, and every later payment CTA is already expired.
3. **The day-three paid-member preferences CTA reuses an expired Supabase magic link.** The URL is created when membership becomes active and expires after 24 hours, but `Good things come to those who wait` / `Las cosas buenas...` sends at day three.
4. **The same paid-member templates also append UTM parameters with a second `?`.** The authentication token is the first query parameter and should still parse while it is valid, but the appended string corrupts `email_hint`. That prevents the normal expired-link replacement flow from reliably identifying the email address.
5. **Pending-invitation unsubscribe reuses the invitation access token but ignores both its expiry and `used_at`.** The unsubscribe action therefore remains replayable for as long as the token row and invitation remain available, even after the invitation access link was consumed or expired.
6. **Event click-tracking tokens do not expire.** They are reusable redirect/logging capabilities. For feedback emails, the same click token can also bootstrap a fresh authenticated login during the first 24 hours after send.
7. **The intended durable fallback for active-member invitation links appears mismatched.** `/email/click` passes an event click-tracking token to a resolver that looks it up in `event_invitation_access_tokens`. Those are separately generated tokens, so the fallback does not appear reachable. Active-member invitation CTAs therefore still depend on the 24-hour Supabase magic link.
8. **Host-package PDFs are public forever unless the object is removed.** The storage bucket is public, the URL has no token, and there is no programmed expiry.
9. **The English balance-waitlist-release email has no CTA in its published body.** The Spanish version uses `ctaUrl`, and the send code supplies it for both languages.

## Token and capability inventory

| Token or capability | Where it appears | Issued | Current validity | Use behavior | Expired-link behavior |
|---|---|---|---|---|---|
| Supabase email OTP / magic-link hash | Login, active-member event invitations and follow-ups, seat/waitlist notices, event confirmation, new-message notification, paid-member preferences link | When the app or website creates the email link | 24 hours from generation (`otp_expiry = 86400`) | One-time verification | Normal login links with a valid active-member `email_hint` send a replacement. Auto-submit links return to login without automatic replacement. |
| Pending event invitation access token | Pending-member invitation, pending reminder, pending last call | Immediately before delivery | Earlier of seven days and RSVP deadline | One-time POST claim; creates a scoped session valid for the earlier of 24 hours, token expiry, and RSVP deadline | If still before the RSVP deadline, the access page can queue and send one fresh link. |
| Event invitation decline token | Member/pending invitation, RSVP reminder, RSVP last call | Immediately before delivery | Earlier of seven days and RSVP deadline | GET is a scanner-safe preview; POST consumes the outcome and marks decline tokens used | No automatic replacement after expiry. |
| Pending-invitation unsubscribe bearer | Pending-member invitation only | Reuses the pending access token | **No effective expiry is enforced by the unsubscribe RPC** | Replayable preference-changing action | None. |
| Event email click token | Same-origin operational event links | Immediately before delivery | **No expiry column or validation** | Reusable; records click and redirects to the frozen destination | Continues redirecting indefinitely while the row exists. |
| Feedback click-login capability | Rating and “did not attend” links | Uses the event click token and sent delivery | Authentication privilege lasts 24 hours after `sent_at`; the click token itself does not expire | A valid click mints a fresh one-time Supabase link and immediately redirects through it | After 24 hours the URL only redirects to the protected feedback page; the member must log in normally. |
| Loops workflow payment-resume token | Warm-lead workflow | At story submission/contact preparation | Default 1,455 minutes: 15-minute configured reminder delay plus a 1,440-minute token lifetime | Reusable until expiry, despite recording first use | An exact expired token can request a fresh transactional payment-link email. A malformed token cannot. |
| Transactional payment-resume token | `Payment link EN/ES` | When a fresh payment link is requested from an expired valid token or manual flow | Default 1,440 minutes | Reusable until expiry | Another exact expired-token visit may request another fresh email while the lead remains pending. |
| Payment-resume session cookie | Created after a valid resume-token click | At click | Default 1,440 minutes from click; not capped to the remaining link-token lifetime | Reusable HTTP-only website session | User requests a new payment link. |
| Membership refund feedback token | Refund confirmation EN/ES | Once for the initial email and once for every resend | 30 days from that delivery | Reusable until expiry, but only one feedback record is allowed per refund | Resend creates a new 30-day token. Older delivery tokens are not revoked and remain valid until their own expiry. |
| Refund feedback access cookie | Created by the feedback access route | At click | Earlier of 30 days and the selected token's remaining lifetime | HTTP-only access to the refund feedback form | Reopen a still-valid email link or request a resend operationally. |
| Public referral / benefit code | Paid-member workflow invite link and `ONELASTCHANCE` promotion | Code creation/configuration | No cryptographic link expiry | Public business-rule code, not authentication | Acceptance depends on the code still being enabled and within its redemption rules. |
| Public host-package URL | Host package EN/ES | PDF generation | No programmed expiry | Public Supabase Storage object | Only object removal or bucket-policy change invalidates it. |

## Active Loops workflows

### Warm lead, didn't pay

**Trigger:** Loops watches a `membershipStatus` property change with re-entry disabled, then filters into English or Spanish segments where `membershipStatus = pending`. In the normal product flow, the website creates/updates this contact after a submitted story that still requires payment.

**Token creation:** the website creates one `paymentResumeUrl` at story submission. Current application defaults issue it for 1,455 minutes. Loops then reuses that same contact property throughout the workflow.

| Relative time from workflow entry | English / Spanish email | Link sent | Authentication state at send |
|---|---|---|---|
| 10 minutes | Experiment: `You're one step away...` / `Estás a un paso...`; `Your story deserves an ending` / `Tu historia merece un final`; `Next weekend's tables are forming` / Spanish equivalent | `paymentResumeUrl` in three of four variants. `Did we do something wrong?` / `¿Hicimos algo mal?` has no functional CTA. | Nominally about 24h05m remains, but every payment URL is malformed by the second `?` before UTM parameters. |
| 1 day 10 minutes | `This is your chance for real connections` / `Esta es tu oportunidad...` | Same `paymentResumeUrl` | About five minutes remains with current defaults; URL is also malformed. |
| 3 days 10 minutes | `What happens at our events` / `Qué sucede...` | Same `paymentResumeUrl` | Expired; URL is also malformed. |
| 4 days 10 minutes | `A special something for you` / `Algo especial para ti` | Public `/invite/ONELASTCHANCE` | No authentication token. |
| 6 days 10 minutes | `Let's talk about love` / `Hablemos de amor` | Same `paymentResumeUrl`; also public collection and Instagram links | Expired; URL is also malformed. |
| 8 days 10 minutes | `You might be wondering why` / `Quizás te preguntes por qué` | Public survey and Instagram links | No authentication token. |

All live workflow payment CTAs use this unsafe construction:

```text
{contact.paymentResumeUrl}?utm_source=...
```

Because `paymentResumeUrl` is already `/membership/resume?token=...`, the UTM parameters must be appended with a URL-aware operation or `&`, not a second `?`.

### New paid member

**Trigger:** `membershipStatus` changes to `active`, with re-entry disabled, followed by English/Spanish active-member audience filters. The website performs this update after Stripe membership completion or a free-benefit activation.

**Token creation:** `goingOutPreferencesUrl` is a Supabase one-time magic link created at activation. It is stored on the Loops contact and reused.

| Relative time | English / Spanish email | Link sent | Authentication state |
|---|---|---|---|
| Immediate | `Welcome to the one plus one club!` / `¡Te damos la bienvenida...!` | `goingOutPreferencesUrl` to `/preferences` | Valid for 24 hours from activation and one-time use. The second-`?` UTM bug corrupts `email_hint`, but the earlier `token_hash` should still parse while valid. |
| Day 1 | `Get more chances at love` / `Más oportunidades...` | Static app `/login`; public member `inviteUrl`; Instagram | No token in the URLs. The invite URL contains a public referral code, not authentication. |
| Day 3 | `Good things come to those who wait` / `Las cosas buenas...` | Reuses `goingOutPreferencesUrl` | Already expired at send. The corrupted `email_hint` also undermines the normal replacement-email path. |
| Day 6 | `Let's talk about love` / `Hablemos de amor` | Public collection and Instagram links | No authentication token. |
| Day 9 | `You might be wondering why` / Spanish equivalent | Public survey and Instagram links | No authentication token. |

## Transactional email inventory

English and Spanish versions are paired below where their behavior is identical.

### Login and payment

| Published email | Trigger | Functional link | Token and expiry |
|---|---|---|---|
| `EN - Auth from supabase`; `ES - Auth from supabase` | Active member requests or resends login; also used for normal expired-link replacement. If Loops is unavailable, the app asks Supabase to send its built-in email instead. | `{data.confirmationUrl}` to app `/auth/confirm`; the email also displays the OTP code. | Supabase one-time OTP/magic-link token, 24 hours from generation. Normal expired links can send a fresh email when `email_hint` decodes to an active member. |
| `Payment link EN`; `Payment link ES` | Website receives an exact but expired payment-resume token, or another manual fresh-link flow requests a new email. | `{data.paymentResumeUrl}` | Fresh reusable payment token, 24 hours. A successful click creates a 24-hour payment session. |

### Event lifecycle

All same-origin event links except `unsubscribeUrl` are normally wrapped in `/email/click?token=...&to=...`. The wrapper token has no expiry. The destination's own token rules still apply.

| Logical email / published name | When it is triggered | Links in the published email | Token behavior |
|---|---|---|---|
| `invitation_member` / `Member invitation` | Founder sends the invitation batch at the planned invitation time to active members. | `ctaUrl`, `declineUrl` | CTA contains a one-time 24-hour Supabase magic link to `/going-out`. Decline token expires at the earlier of seven days and RSVP deadline. |
| `invitation_pending` / `Pending member invitation` | Same founder invitation batch, for pending members. | `ctaUrl`, `declineUrl`, `unsubscribeUrl` | CTA access token is one-time and expires at the earlier of seven days and RSVP deadline; the resulting scoped session is capped at 24 hours and the deadline. Decline has the same deadline cap. Unsubscribe reuses the access token but currently ignores expiry and use state. |
| `rsvp_reminder` / active and pending reminder variants | Founder action due 24 hours after invitations, only for non-responders who are still active or pending and before the deadline. | `ctaUrl`, `declineUrl` | Active CTA: new one-time 24-hour Supabase link. Pending CTA: new access token capped to seven days/deadline, invalidating earlier unused access tokens. Decline: new token capped to seven days/deadline. |
| `rsvp_last_call` / active and pending last-call variants | Founder action due four hours before RSVP deadline, only while the deadline remains open. | `ctaUrl`, `declineUrl` | Same token types as the reminder. The event deadline makes the useful lifetime at most about four hours. |
| `invitation_declined` and legacy `cancellation_received` / `Cannot make it` | Immediately after a member declines an open invitation. | No functional user CTA in the published body. | No email authentication token. |
| `seat_confirmed` / `Seat confirmed` | Immediately after acceptance/payment or a promotion produces a confirmed seat. | `ctaUrl` | New one-time 24-hour Supabase magic link. Auto-submit expiry does not automatically send a replacement. |
| `waitlist_balance` / `Balance waitlist` | Immediately after acceptance leaves the member waiting for balance while reserving the relevant credit. | `ctaUrl` | New one-time 24-hour Supabase magic link. |
| `waitlist_capacity` / `Capacity waitlist` | Immediately after acceptance reaches capacity or a payment hold expires; no credit is spent. | `ctaUrl` | New one-time 24-hour Supabase magic link. |
| `waitlist_balance_released` / `Balance waitlist released` | Founder confirms/releases the event while an accepted member remains balance-waitlisted. | Spanish uses `ctaUrl`; **English currently has no CTA**. | The supplied CTA is a normal `/going-out` URL with click tracking, not an authentication token. It requires an existing app session. |
| `event_confirmed` / `Event confirmed` | Founder confirms the event and releases venue details at/after the RSVP decision point to confirmed non-host attendees. | `ctaUrl` | New one-time 24-hour Supabase magic link. |
| `host_package` / `Host package` | Confirmation routes the assigned confirmed host to the host-package variant; Ops can also test/send the package explicitly. | `materialUrl` | Public storage URL, no token and no expiry. The PDF is also prepared as an attachment by the delivery path. |
| `event_cancelled` / `Event cancelled` | Founder cancels an open event. | No functional user CTA in the published body. | No email authentication token. |
| `event_reminder` / host and no-host variants | Founder action due 12 hours before the event for confirmed attendees. | `ctaUrl` | Normal `/going-out` URL with non-expiring click wrapper; no authentication token in the destination. Existing login is required. |
| `reservation_cancellation_received` / `Reservation cancelled` | Immediately after a member cancels a confirmed or waitlisted reservation. | No functional user CTA in the published body. | No email authentication token. |
| `replacement_refund` / `Replacement refund` | Founder records that a replacement was found and the cancelled member's credit is returned. | `ctaUrl` | Normal `/credits` URL with non-expiring click wrapper; no authentication token in the destination. |
| `no_replacement` / `No replacement found` | Founder action due six hours before the event when no replacement was found. | No functional user CTA in the published body. | No email authentication token. |
| `feedback_request` / `Feedback request` | Founder marks/sends after event completion; operationally due three hours after event end. | Five rating URLs and one `did not attend` URL | Each is wrapped by the non-expiring click token. For 24 hours after send, the token-to-delivery association can mint a fresh one-time Supabase login and carry the rating selection into the form. After 24 hours it only redirects to the protected page. |

There is also a `credit_offer` operational delivery, due 20 hours after event end for eligible members who submitted feedback. Ops emits the configured Loops event `postEventCreditOffer`, but no live workflow currently has a matching event trigger, so it does **not currently send an email**.

### Messages

| Published email | Trigger | Functional link | Token and expiry |
|---|---|---|---|
| `New message · EN`; `New message · ES` | Every successful new conversation message or reply queues and immediately attempts a notification to the other member. The email deliberately omits sender and message content. | `{data.ctaUrl}` to `/messages/{conversationId}` | New one-time Supabase magic link, 24 hours from notification generation, with auto-submit. On expiry it falls back to login rather than automatically emailing a replacement. |

### Refunds

| Published email | Trigger | Functional link | Token and expiry |
|---|---|---|---|
| `Membership refund confirmation · EN`; `Membership refund confirmation · ES` | Ops completes a membership refund with an accepted Stripe status; Ops can also explicitly resend the confirmation. | `{data.feedbackUrl}` to `/refund-feedback/access?token=...` | Random 32-byte bearer, 30 days from each delivery. Resend creates another token but does not revoke prior delivery tokens. One feedback record is allowed per refund. |

### Support

| Published email | Trigger | Functional user links | Token and expiry |
|---|---|---|---|
| `Support request received · EN`; `Support request received · ES` | Website accepts a support form submission and sends the customer confirmation. | Public home/logo and Instagram links only. | No token. |
| `Support reply · EN`; `Support reply · ES` | Founder sends a reply from Ops. | Public home/logo only. | No token. |
| `Support message notification` | Website alerts staff about a new support request. This is staff-facing, not a user email. | `{data.opsUrl}` to the protected Ops application. | No bearer token in the supplied URL; Ops authentication is still required. |

## Common public links and image requests

These links do not authenticate a user:

| Link family | Emails | Expiry / access |
|---|---|---|
| `https://oneplusoneclub.com` | Most transactional and workflow footers/logos | Public; no expiry. |
| `https://www.instagram.com/oneplusone_club?...` | Event, support, lead, and member emails | Public; no expiry. |
| `/collection`, `/es/coleccion` | Later lead and paid-member workflow messages | Public; no expiry. |
| `/survey`, `/es/encuesta` | Final lead and paid-member workflow messages | Public; no expiry. |
| `https://app.oneplusoneclub.com/login?...` | Day-one paid-member workflow | Public login page; no token. |
| `{contact.inviteUrl}` | Day-one paid-member workflow | Public referral/benefit code; governed by redemption rules, not authentication expiry. |
| `/invite/ONELASTCHANCE` | Special warm-lead workflow email | Public campaign code; governed by its business configuration. |
| `/email/{language}/welcome/{firstName}.png` | Personalized greeting in many emails | Public dynamic image request; no token or expiry. The recipient's first name is present in the URL and therefore may appear in request/provider logs. |
| `/email/{language}/with-love-oneplusoneclub.png` | Email signatures | Public image; no expiry. |

A URL such as `/going-out`, `/credits`, `/preferences`, or an event page may be protected by the app even when the URL itself contains no token. The distinction in this report is whether opening the email URL creates or conveys authentication, not whether the destination eventually requires a login.

## Published, draft, or currently unused catalog entries

- `Refund requests` is published but has no functional links in its current body and no active source caller was found.
- `Referral code used` is draft only and therefore not sending.
- `Your payment has been received - receipt inside` is draft only and therefore not sending.
- The two draft workflows are not sending. Their current editor messages contain static brand/image/Instagram links and several visually rendered buttons without functional destinations.
- All operational event transactional definitions listed above are published. A published definition is not proof that a send path is active; the `credit_offer` gap is the clearest example.

## Review and adjustment matrix

These are recommended target decisions, not changes already made.

| Priority | Scenario | Current state | Recommended target |
|---|---|---|---|
| P0 | Warm-lead payment URLs | Every tokenized CTA is malformed; the one stored token expires near the second email and long before later emails. | Fix URL construction immediately. Prefer issuing a fresh 24-hour token for each email at send time. If Loops cannot request a fresh token, link to a stable “email me a new payment link” flow instead of storing a campaign-long authentication bearer. |
| P0 | Paid-member day-three preferences | Reuses a one-time 24-hour link at day three; UTM construction corrupts recovery metadata. | Use a normal protected `/preferences` URL with login, or send the reminder from code with a freshly issued link. Append UTM parameters with URL parsing, never string `?` concatenation. |
| P0 | Pending invitation unsubscribe | Reuses an authentication token and deliberately/accidentally ignores its expiry and consumption. | Issue a separate, purpose-bound unsubscribe token. Decide explicitly whether it should be long-lived (for example one year) or non-expiring; do not make an expired invitation-auth token perform both jobs. |
| P1 | Active-member invitation CTA | 24-hour Supabase magic link, while the RSVP window may be longer; apparent durable fallback uses the wrong token namespace. | Give active members the same purpose-specific invitation access/exchange model as pending members, capped to the RSVP deadline, or repair and test a click-token-to-invitation recovery mapping. |
| P1 | Event click tracking | No expiry or cleanup. Feedback click token has login-minting privilege for its first 24 hours. | Add `expires_at`, validate it in `record_event_email_click`, and clean up old rows. A 30-day tracking lifetime, with the feedback privilege still separately capped at 24 hours, is a reasonable starting point. |
| P1 | Host package | Public PDF with no expiry, containing event-specific operational material. | Make the bucket private and send a signed URL capped to event end plus 24 hours, or remove the body link and rely on the attachment. |
| P1 | Payment session after click | 24-hour website session even when a link had only minutes remaining; longer than the existing two-hour payment-access cookies. | Reduce the derived payment session to two hours unless there is a demonstrated checkout need for longer. Link expiry and session expiry should be separate, deliberate choices. |
| P2 | Direct member login | Global one-time link remains valid 24 hours. Replacement is easy for normal login links. | After purpose-specific event/message links are decoupled, consider 30–60 minutes for direct login. Avoid shortening the global Supabase TTL first, because it currently controls many other email scenarios. |
| P2 | New-message notification | One-time auto-submit link valid 24 hours, with no automatic replacement. | Keeping 24 hours is defensible for asynchronous messaging; ensure the expired destination makes normal login and return-to-conversation obvious. |
| P2 | Seat, waitlist, and confirmation links | One-time 24-hour auto-login links. | Keep 24 hours if convenience justifies it, but provide a clean normal-login fallback to the frozen destination. They do not need to inherit invitation-deadline behavior. |
| P2 | Refund feedback | Every send creates a 30-day token; old resend tokens remain valid. | Thirty days is reasonable for feedback. Revoke earlier tokens on resend so only the latest delivery remains an active bearer. |
| P2 | Feedback request | Click-to-login privilege is 24 hours; click redirect itself never expires. | Keep the 24-hour login privilege if intended, add the general click-token expiry, and define how long the feedback form itself accepts submissions. |
| P3 | Pending invitation access | One-time, capped to seven days and RSVP deadline, with scanner-safe claim and reissue. | Keep. This is the strongest current model and a good pattern for active-member invitations. |
| P3 | Invitation decline | Scanner-safe POST, capped to seven days and RSVP deadline. | Keep. |

## Suggested implementation sequence

1. Repair both second-`?` Loops template families and stop the currently broken payment CTAs.
2. Replace workflow-stored authentication URLs with fresh-per-send links or stable request-new-link pages.
3. Separate pending unsubscribe from invitation authentication.
4. Repair or replace the active invitation durable-access path.
5. Add expiry and cleanup to event click tokens.
6. Privatize or intentionally retire the public host-package link.
7. Review the lower-risk lifetimes—direct login, messages, refund feedback, and derived payment sessions—after the purpose-specific flows are separated.

## Source map

Primary implementation locations reviewed:

- App authentication: `src/lib/auth-link.ts`, `src/lib/member-login-email.ts`, `src/app/auth/confirm/page.tsx`
- Event click and feedback login: `src/app/email/click/route.ts`, `src/lib/event-email-click.ts`, `src/lib/feedback-email-login.ts`, `src/lib/event-invitation-access.ts`
- App event and message delivery: `src/lib/event-email-delivery.ts`, `src/lib/message-email-delivery.ts`
- Pending invitation, decline, unsubscribe, click, and refund migrations: `supabase/migrations/202607*.sql`
- Ops event link generation and scheduling: `../ops/src/lib/events/actionable-links.ts`, `../ops/src/lib/events/click-tracking.ts`, `../ops/src/lib/events/policy.ts`, `../ops/src/lib/events/email-timeline.ts`, `../ops/src/lib/actions/event-operations.ts`
- Ops refunds and host packages: `../ops/src/lib/membership-refunds.ts`, `../ops/src/lib/actions/event-host-package.ts`
- Website payment and onboarding links: `../website/src/lib/membership-payment.ts`, `../website/src/lib/payment-resume-email.ts`, `../website/src/lib/member-app-access.ts`, `../website/src/lib/loops.ts`
- Website triggers: `../website/src/pages/api/story-registration-contact.ts`, `../website/src/pages/api/stripe-webhook.ts`, `../website/src/pages/api/benefit-code.ts`, `../website/src/lib/stripe-membership-completion.ts`
- Shared Supabase Auth setting: `../website/supabase/config.toml`
