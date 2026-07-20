# Ops agent brief: event questions and host package

Implement this in the **ops repository** as part of the existing founder-operated event control centre. Do not build scheduling or automatic sends. The founders choose the questions, generate the package, assign the host, and trigger the email manually.

## Environment URLs

Use `MEMBER_APP_URL` as the only base URL for links back to the member app:

- local ops + local app: `http://localhost:3030`
- deployed development: `https://dev-app.oneplusoneclub.com`
- production: `https://app.oneplusoneclub.com`

Never derive the member-app origin from the ops request URL. Validate that non-local values use HTTPS. Generic member event destinations use `${MEMBER_APP_URL}/going-out`; host-package buttons use the generated public material URL.

## Existing contract to reuse

- `public.questions` stores English `prompt`, Spanish under `localized_content.es.prompt`, `type` (`sharing_time` or `spicy_time`), and spicy intensity `rating` (1–3).
- Only active, non-public questions (`deleted_at is null` and `is_public = false`) may be assigned.
- `public.event_questions` stores the event selection and `sort_order`.
- `public.event_hosts` stores the founder-selected host.
- `public.event_materials` stores locale, kind (`host_guide`, `questions_pdf`, or `event_guide`), version, and an HTTPS public URL.
- The member app now reads assigned questions server-side and shows them only to the assigned host. Do not loosen RLS for ordinary authenticated members.

## Build on the event page

Add a **Questions & host package** section to the event control centre with:

1. Two searchable question libraries: Sharing time and Spicy time.
2. English prompt, Spanish-translation status/preview, spicy rating, and whether the question was used with anyone in the confirmed cohort before.
3. An ordered selected list with add, remove, move up/down, and drag-to-reorder if the existing UI supports it cleanly.
4. Filters for type, spicy rating, missing Spanish translation, and prior cohort exposure.
5. A preview toggle for English and Spanish.
6. A clear unsaved state and one explicit **Save event questions** action.
7. No invented hard minimum. Show counts per type and a warning if either section is empty; founders decide the final number until product sets a rule.

Saving must replace that event's assignments atomically, preserve the submitted order, reject duplicate question IDs, and revalidate the event page. Prefer one service-role RPC for the replacement and audit it as an event action. If that RPC does not exist, add one database migration and mirror the same migration in both app and ops repositories before either branch is pushed.

## Generate the host package

Add **Generate host package** after the saved selection. It must:

1. Refuse to generate when there is no saved question in either section or the selected host is missing.
2. Generate both English and Spanish event-specific PDFs from the saved database assignments, not from unsaved browser state.
3. Put the host instructions first, followed by Sharing time and Spicy time question cards in saved order.
4. Format question pages so cards can be printed and cut apart. Include type labels; include spicy rating only as a subtle host cue, not as participant-facing scoring.
5. Include no attendee names, emails, matching answers, or other private profile data.
6. Upload files under unguessable event/version paths. Links may be unauthenticated because they are emailed, but must not be indexed or discoverable through a listing.
7. Insert new `event_materials` rows with a content-derived or timestamped version. Never overwrite the historical row for a package that may already have been emailed.
8. Show generation time, version, locale, and working download links in ops.

The canonical bilingual instructions and generic reference PDFs live in the app repository:

- `src/content/event-host-playbook.json`
- `public/host-materials/event-host-guide-en.pdf`
- `public/host-materials/event-host-guide-es.pdf`

Reuse the JSON content or deliberately duplicate it with a test that detects drift. The event-specific PDF is the primary `materialUrl` for the existing host-package email.

## Host assignment, app, and email

Keep host assignment manual. The host must have a confirmed, non-cancelled seat. After assignment:

- the member app event page shows the host-only playbook and the saved assigned questions;
- ordinary participants see only the host's first name and public introduction after event details are released;
- private host contact details remain hidden;
- the host email links to the event-specific printable package; its generic member-app event destination is Going Out.

Update the host-package send preflight so it requires:

- assigned host;
- saved event questions;
- generated material for the host's locale;
- final event time and released venue details;
- valid `MEMBER_APP_URL`.

Use the existing durable `event_email_deliveries` and idempotent Loops sender. Do not send directly from a component. The email should include the event date/time, restaurant/address, printable package link, and a concise reminder to arrive 10 minutes early. English and Spanish must use their matching package.

## Balance-waitlist correction that must travel with this work

Do not describe every waitlist as credit-free:

- accepted gender-balance waitlist: spend/reserve the event credit immediately;
- promotion from that waitlist: retain the existing debit, with no second debit;
- the needed balancing participant is not found, the club cancels, or the member leaves before promotion: return the credit exactly once and notify the member;
- capacity or payment-hold-expiry waitlist: do not debit a credit.

The database migration, ops display, member copy, and EN/ES Loops transactionals must agree before this policy is considered complete. Add a dedicated refund/release transactional if none of the current templates accurately explains that the event may still proceed without this waitlisted member.

## Acceptance checks

- Saving, reordering, regenerating, and refreshing preserves the exact question order.
- A deleted or public question cannot be assigned, including through a direct request.
- Spanish preview and PDF use Spanish where supplied and fall back visibly to English where missing.
- Only the assigned host can see the question list in the member app.
- Both PDF URLs work from the host email and ops.
- Regeneration creates a new version; resending the same delivery is idempotent.
- Local, dev, and production host links point to the correct member-app origin.
- Existing event preparation, invitation, confirmation, and host-send focused tests still pass.
