# Event transactional email source review

Last updated: 2026-07-19

## Purpose

This report records how the 15 event transactional email types were matched to
the existing `Romantic event invitation` workflow, what was changed to make
the workflow content usable as transactional email, and what still needs
founder review.

Each transactional has an English and Spanish version. Both locales use the
same source mapping and have the same operational gaps unless noted otherwise.

## Migration result

- The existing 30 transactional IDs were retained and republished.
- Nine transactional types use text from a directly corresponding Romantic
  workflow email.
- Two extra Romantic workflow variants were folded into an existing
  transactional type or left as a documented gap.
- Six transactional types had no Romantic workflow source and therefore use
  new copy based on the agreed event flow.
- All emails use the existing Loops theme and the existing intro, signature,
  and locale-specific Instagram components.
- The original workflow is unchanged.

## Shared template constraint

The workflow components use `{contact.hello}`, `{contact.firstName}`, and
`{contact.language}`. Loops rejects `{contact.*}` merge tags in
transactional messages, including when contact fallbacks are configured.

The transactionals therefore retain the same Component IDs, wrappers, artwork,
spacing, and dynamic image endpoints, but the local component children use:

- `{data.firstName}` for the recipient name;
- a fixed `en` or `es` path for the greeting and signature images; and
- a locale-specific static greeting, `Dear` or `Hola`.

This is compatible with the app and ops payloads, which already send
`firstName`. It also means changes to the component's internal merge-tag
bindings will not automatically replace these local transactional overrides.

The Instagram components currently use onboarding-oriented UTM values
(`friends-email` and `new-member-email`), not event-specific attribution.

## Source mapping

| Transactional type | Romantic workflow source | Result |
| --- | --- | --- |
| `invitation_member` | Event invitation | Source text and layout retained; event facts made dynamic |
| `invitation_pending` | No direct source | Event invitation template plus pending-member payment flow |
| `seat_confirmed` | It's a date! | Source text and layout retained |
| `waitlist_balance` | Date waitlist | Source text and layout retained |
| `waitlist_capacity` | Your event update | Source text retained; event-page button added |
| `cancellation_received` | Not this time | Source text and layout retained |
| `rsvp_reminder` | Event invitation reminder | Source text retained; rolling 24-hour wording replaced by the real deadline |
| `event_confirmed` | Date confirmation | Source text retained with available confirmation facts and confirmed policy corrections |
| `event_cancelled` | No direct source | New copy |
| `host_package` | Host Date confirmation | Source host instructions retained with confirmed policy corrections |
| `event_reminder` | Your date is coming up | Short source reminder retained with dynamic facts |
| `replacement_refund` | No direct source | New copy |
| `no_replacement` | No direct source | New copy |
| `late_cancellation_notice` | No direct source | New copy based on the database recipient cohort |
| `feedback_request` | No direct source | New copy based on the feedback and messaging flow |

## Per-email review

### 1. Member invitation

Source: **Event invitation**

Implemented:

- Dynamic event date, language, city, majority intention, age range, format,
  time, RSVP deadline, and event-page link.
- The source's hardcoded orientation line was omitted because no orientation
  variable is provided to the email.

Review:

- The opening says "someone special" even though the invitation is for a group.
- "If you decide to go, 1 credit will be charged" is too broad: members placed
  on a waitlist should not spend a credit.
- The source promises that the number of guests will be revealed after group
  confirmation, but no guest-count variable currently exists.
- `eventLanguage` is populated from `languageCode`. Confirm whether the
  stored value is human-readable or whether the email may display `en`/`es`.
- No additional attendee languages are available, so the desired wording
  "Event held in X; attendees also speak Y, Z" cannot yet be produced.

### 2. Pending-member invitation

Source: no direct source; uses the Event invitation template.

Implemented:

- The agreed payment-before-reservation flow and 10-minute seat hold.
- Priority position is retained after the hold, while the seat is no longer
  blocked.

Review:

- The email does not show the membership price or precisely distinguish the
  membership payment from the event-credit charge.
- The final post-payment seat outcome still depends on availability; this
  should be checked in an end-to-end test.
- It shares the invitation's missing orientation, guest-count, language-label,
  and additional-language gaps.

### 3. Seat confirmed

Source: **It's a date!**

Implemented: source text and Thursday-details wording.

Review:

- The text says the team is waiting for "everyone else"; the event can be
  confirmed at the minimum of six without every invitee responding.
- Thursday is correct only when founders release confirmation on Thursday.
- The separate source email for people interested in hosting has no matching
  transactional type or conditional variable. Host interest currently has to
  be handled in the app/ops flow rather than this email.

### 4. Balance waitlist

Source: **Date waitlist**

Implemented: source text, Thursday update, and event link.

Review:

- The source explicitly promises a binary 50/50 gender balance. Confirm this is
  the rule for every event type and city.
- It does not state that no credit is spent while waitlisted.
- Thursday depends on manual founder timing.

### 5. Capacity waitlist

Source: **Your event update**

Implemented:

- Source text retained.
- An event-page button was added because the copy tells the recipient they can
  leave the waitlist.

Review:

- Confirm the event page reliably allows a capacity-waitlisted member to remove
  themselves.
- "We create new groups every week" is an operational promise that may not be
  true for every city or cohort.
- It does not state that no credit is spent while waitlisted.

### 6. Cancellation received

Source: **Not this time**

Implemented: source text retained.

Review:

- This transactional type can be used for more than a simple invitation
  decline. The source copy does not explain late-cancellation replacement
  handling, credit consequences, or messaging removal.
- Consider splitting invitation decline from confirmed-seat cancellation, or
  changing the copy to cover both without ambiguity.
- "New groups every week" is an operational promise.

### 7. RSVP reminder

Source: **Event invitation reminder**

Implemented:

- The source's "in next 24 hours" text was replaced with
  `{data.rsvpDeadline}`, which includes the event timezone's actual deadline.

Review:

- Founder timing remains manual; Loops does not schedule this email.
- The recipient's seat is not actually secured until the accept/payment and
  capacity rules finish.

### 8. Event confirmed

Source: **Date confirmation**

Implemented:

- Venue name, address, date, time, event language, updated age range, majority
  intention, event instructions, and event link.
- The source promise that guests can contact the host was removed because that
  contact route is not part of the agreed flow.
- The late-cancellation sentence now reflects the replacement rule: a credit is
  returned only when a replacement is found.

Review:

- No `guestCount` variable exists.
- No `hostName` or short host-profile variable exists.
- No additional-attendee-languages variable exists.
- The original requested confirmation content cannot be complete until these
  variables are added to the frozen delivery payload.

### 9. Event cancelled

Source: no direct source.

Implemented:

- Cancellation reason and event link.
- The email states that a used event credit is returned automatically, which
  matches the club-cancellation database transaction.

Review:

- Confirm whether pending-member membership payments ever require a separate
  monetary refund. The current database action only guarantees the event-credit
  refund.
- There is no source-approved tone or wording for this email.

### 10. Host package

Source: **Host Date confirmation**

Implemented:

- Source hosting instructions and Hosting Playbook CTA.
- Dynamic venue, address, date, time, and event language.
- The source promise that guests can contact the host was removed.
- The late-cancellation sentence was aligned with the replacement rule.

Review:

- The source asks for both a Hosting Playbook and printable questions. The
  payload supplies only one `materialUrl`; the current resolver selects one
  latest material from either `host_guide` or `questions_pdf`.
- Separate `hostGuideUrl` and `questionsPdfUrl` variables are needed to
  guarantee both links.
- The mixed-table instruction assumes a male/female alternating layout and may
  not apply to every event.
- The host source says to arrive five minutes early; other planning notes have
  used ten minutes.
- No guest count is supplied.

### 11. Event reminder

Source: **Your date is coming up**

Implemented: the shorter source reminder with dynamic venue, city, date, time,
and event link.

Review:

- A second Romantic source says "Only 12 Hours Until Your Event." There is only
  one transactional type and no `hoursUntilEvent` variable, so both variants
  cannot be represented accurately.
- Sending time is manual and not enforced by Loops.
- The source reminder does not include the venue address or event instructions,
  although those values are available.

### 12. Replacement refund

Source: no direct source.

Implemented: replacement confirmation, automatic credit return, and messaging
removal.

Review:

- No `creditAmount` or updated-balance variable is supplied, so the email
  cannot show the exact adjustment.
- There is no source-approved tone or wording.

### 13. No replacement

Source: no direct source.

Implemented: no-replacement outcome, no automatic credit return, and event
link.

Review:

- No `hoursUntilEvent` or explicit cutoff variable is supplied for the agreed
  six-hour notice.
- The copy invites the cancelled member to open the event if they can attend
  after all, but there is no confirmed self-service "restore attendance"
  action in the app.
- There is no source-approved tone or wording.

### 14. Late cancellation notice

Source: no direct source.

Implemented:

- The email is written to the cancelling member, explaining that a replacement
  search has started and how the credit outcome works. This matches the current
  database cohort, where `late_cancellation_notice` selects a replacement
  record with status `eligible`.

Review:

- There is no founder control in the current ops policy/UI that dispatches this
  email type directly.
- Confirm whether this email should go to the cancelling member, the remaining
  attendees, or both. A remaining-attendee notice would require a separate
  recipient branch and different copy.
- There is no source-approved tone or wording.

### 15. Feedback request

Source: no direct source.

Implemented:

- Overall, questions, hosting, and restaurant feedback.
- One-star detail requirement.
- Feedback-gated private messaging and one initial message per confirmed
  participant.

Review:

- Sending three hours after the event remains a manual founder action; it is
  not scheduled by Loops.
- The app does not record physical attendance. Eligibility is based on a
  confirmed seat and the event having ended.
- The one-star detail field is currently always visible in the app; validation
  requires it only when a rating is one star. The desired conditional reveal is
  not implemented.
- There is no source-approved tone or wording.

## Recommended review order

1. Add confirmation payload fields: guest count, host name/profile, and
   additional languages.
2. Split the host material URL into guide and questions-PDF URLs.
3. Decide the late-cancellation-notice recipients and expose the action in ops.
4. Decide whether a cancelled member can restore attendance when no replacement
   is found.
5. Review the 50/50 gender-balance and mixed-seating wording.
6. Review credit language in invitations and cancellation emails.
7. Decide whether the Instagram components should use event-specific UTM
   attribution.
