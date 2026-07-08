# Production Test User Cleanup

Use this runbook when removing test users from the production Supabase database.
Do not use `.env.local` for production cleanup; this repo's local env points at
the dev project.

Always verify the target project before running SQL. For production, use the
Supabase CLI from the ops workspace and guard every destructive command with the
production ref:

```bash
cd /Users/adrian/projects/oneplusoneclub/ops
npx supabase link --project-ref qevpnhaycygiyjxeucmj
test "$(cat supabase/.temp/project-ref)" = "qevpnhaycygiyjxeucmj"
```

Do not rely on the Supabase MCP connector unless `get_project_url` confirms it
is connected to `https://qevpnhaycygiyjxeucmj.supabase.co`.

## Candidate Rule

The current cleanup rule is:

```sql
split_part(lower(email), '@', 1) like 'bigolo+%'
or split_part(lower(email), '@', 2) = 'example.com'
```

Apply the same rule to:

- `auth.users.email`
- `public.members.email_norm`
- `public.profile_registrations.contact_email_norm`

## Required Safety Checks

Before deleting anything, compute and review:

- distinct candidate emails
- matching `auth.users`
- matching `public.members`
- matching `public.profile_registrations`
- event records touched by candidates
- conversations touched by candidates
- real members on touched events
- mixed conversations with real members
- real-member credit ledger rows related to candidates
- real-member redemptions where a candidate is the referrer
- candidate redemptions that used non-candidate benefit codes
- profile image objects under candidate member-id paths

Abort if candidates share events or conversations with real members unless the
cleanup intent explicitly includes removing those real-user-visible records.

## Backup First

Keep a durable production backup before deleting. The production database has:

```sql
ops.test_user_cleanup_backups
```

Store one JSON snapshot per cleanup run with:

- criteria and expected counts
- actual pre-delete counts
- candidate emails and ids
- complete rows for affected auth, member, registration, event, message,
  notification, payment-resume, benefit-code, and credit-ledger records
- storage object metadata for profile images
- benefit-code counter adjustments

The June 25, 2026 production cleanup backup id is:

```text
ba953b84-100b-4ec8-9b55-c5a34f93fb97
```

An earlier dev cleanup was accidentally run against
`oackdojvcfrkzbnprovb`; its backup id is:

```text
a85ae31f-313e-490c-98be-28591207acd1
```

## Delete Order

Run the destructive cleanup in one transaction with count assertions.

1. Build temporary candidate tables from the rule above.
2. Assert expected counts and assert no real-member overlap.
3. Decrement `public.benefit_codes.used_count` for candidate redemptions that
   used non-candidate codes.
4. Remove candidate profile image storage metadata. Prefer the Supabase Storage
   API when production service-role credentials are available. SQL metadata
   deletion requires `set local storage.allow_delete_query = 'true'`.
5. Delete candidate `public.profile_registrations`.
6. Delete candidate `public.members`; child app data mostly cascades from here.
7. Delete candidate `auth.users`; auth sessions, identities, and one-time
   tokens cascade from here.
8. Commit only after all row counts match the asserted plan.

## Verify

Rerun the preflight query after commit. These must be zero:

- candidate distinct emails
- candidate auth users
- candidate members
- candidate profile registrations
- candidate benefit codes
- candidate benefit-code redemptions
- candidate credit ledger entries
- candidate event invitations and attendees
- candidate conversations and messages
- candidate notifications
- candidate profile image storage metadata

Also verify the backup row still exists in `ops.test_user_cleanup_backups`.

## Remove Loops Contacts

After production database cleanup is verified, remove the same candidate emails
from Loops. Confirm the CLI is authenticated to the production Loops team first:

```bash
loops auth status
loops api-key --output json
```

Extract emails from the production backup, not from live member tables:

```bash
cd /Users/adrian/projects/oneplusoneclub/ops
npx supabase link --project-ref qevpnhaycygiyjxeucmj
test "$(cat supabase/.temp/project-ref)" = "qevpnhaycygiyjxeucmj"

npx supabase db query --linked "
select jsonb_array_elements_text(backup -> 'candidate_emails') as email
from ops.test_user_cleanup_backups
where id = 'ba953b84-100b-4ec8-9b55-c5a34f93fb97'
order by 1;
"
```

Back up Loops contact JSON before deletion:

```bash
while read -r email; do
  loops contacts find --email "$email" --output json
done < /tmp/opo-loops-prod-candidates-20260625.txt \
  > /tmp/opo-loops-prod-contact-backup-20260625.jsonl
```

Delete only the contacts that exist, then verify each email is absent:

```bash
while read -r email; do
  loops contacts delete --email "$email"
  sleep 0.2
done < /tmp/opo-loops-prod-candidates-20260625.txt

while read -r email; do
  loops contacts find --email "$email" --output json
done < /tmp/opo-loops-prod-candidates-20260625.txt
```

Relink the local Supabase CLI back to dev after the production operation:

```bash
npx supabase link --project-ref oackdojvcfrkzbnprovb
```
