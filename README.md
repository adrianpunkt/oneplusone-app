# One Plus One Club Member App

Next.js member portal for one plus one club. The marketing/onboarding website stays in `../website`; this app extends the same Supabase projects for member-owned data.

## Local setup

```bash
npm install
npm run dev
```

Required env:

- `SUPABASE_PROJECT_REF` or `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`
- `APP_URL`
- `LOOPS_API_KEY`
- `SUPPORT_MESSAGE_ENDPOINT` (optional; overrides the website support API used by the in-app question dialog)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET` or `APP_STRIPE_WEBHOOK_SECRET`

Optional analytics env:

- `NEXT_PUBLIC_POSTHOG_KEY` (defaults to the website public key on `app.oneplusoneclub.com`; local/dev tracking stays off unless this is set)
- `NEXT_PUBLIC_POSTHOG_HOST` (defaults to the first-party proxy at `https://e.oneplusoneclub.com`)
- `NEXT_PUBLIC_POSTHOG_UI_HOST` (defaults to `https://eu.posthog.com`)
- `NEXT_PUBLIC_POSTHOG_ENABLED=false` disables the browser client even when a key is configured.

Demo account env:

- `DEMO_MEMBER_PASSWORD` enables password login for `hello@oneplusoneclub.com`.

PostHog initialization keeps the `/flags` remote config request and feature flag
evaluation enabled so project-side session recording settings, sampling, and
linked-flag triggers can start recordings correctly. It uses cookie persistence
with cross-subdomain cookies and identifies signed-in users with `members.id`
and email as PostHog person properties, matching the onboarding website
identity.

Local development runs at `http://localhost:3030` and is configured to use the
Supabase development project:

```text
opo-dev: https://oackdojvcfrkzbnprovb.supabase.co
```

Cloudflare deployments pin the expected Supabase project in `wrangler.jsonc`:

- prod app `app.oneplusoneclub.com` -> `qevpnhaycygiyjxeucmj`
- dev app `dev-app.oneplusoneclub.com` -> `oackdojvcfrkzbnprovb`

`SUPABASE_PROJECT_REF` is the deployment guardrail. When it is present, the app
constructs the Supabase URL from that ref instead of trusting generated
`.env.local` fallback values or a stale `NEXT_PUBLIC_SUPABASE_URL` secret.
`NEXTJS_ENV=cloudflare` disables OpenNext's runtime fallback to bundled
`.env.local` values, so missing Worker secrets fail instead of silently using
local development credentials.

Cloudflare deploys should use `npm run deploy` for prod and `npm run deploy:dev`
for dev. Those wrappers temporarily hide local `.env*` files before OpenNext
builds so generated Worker artifacts cannot carry local Supabase or Stripe
values as runtime fallbacks.

The ignored `.env.local` file contains the matching dev publishable key and a
server-only Supabase key. Use `.env.example` only as the template for new
checkouts; do not commit real keys. For Cloudflare production, prefer the
Supabase `service_role` JWT in `SUPABASE_SERVICE_ROLE_KEY`; the app still keeps
`SUPABASE_SECRET_KEY` as a fallback for local/dev compatibility.

Supabase Auth redirects for the dev project must allow the member app callbacks:

- `http://localhost:3030/**`
- `http://127.0.0.1:3030/**`

Local login links should come back to `http://localhost:3030/auth/callback`.
If a new local login email opens `https://oneplusoneclub.com`, verify the app is
running with `.env.local` and that the dev Auth config has been pushed.

Login uses Supabase Auth email OTPs and magic links. The app generates the
token/link with Supabase admin APIs and sends it through a Loops transactional
email when `LOOPS_API_KEY` is configured. The English transactional ID defaults
to `cmqcfkdqi1er60jygou29o4sw`; the Spanish transactional ID defaults to
`cmqihzpab01ql0jznkf1zjzrg`. Override them with
`LOOPS_LOGIN_TRANSACTIONAL_ID_EN` and `LOOPS_LOGIN_TRANSACTIONAL_ID_ES` if they
change. The Loops templates should use `token` and `confirmationUrl`;
`confirmationUrl` points to `/auth/confirm` and both paths preserve the
requested `next` destination. If Loops is not configured, the login form falls
back to Supabase's built-in email provider.

Used or expired welcome/login links are one-time-use through Supabase
`verifyOtp`. When a used/expired `/auth/confirm` link still carries a valid
active-member `email_hint`, the app sends a fresh Loops login email and redirects
to `/login` in the same code-entry state as a normal login request.

Active-member event invitations mint the same Supabase login token immediately
before the Loops send, set the protected `next` destination to `/going-out`,
and mark the confirmation for browser auto-submit. A normal browser therefore
lands on Going Out after one click, while a non-JavaScript email scanner cannot
consume the token. Automatic expired-link replacement preserves both the event
invitation's Going Out destination and auto-submit behavior. Pending-member
invitations continue to use the separate `/event-invitation/access` flow. Its
GET page is a safe
interstitial: the one-time token is claimed only after the recipient presses
Continue, so email security scanners cannot consume it by following the link.
Continuing from a used or expired link automatically emails one fresh
invitation link while the RSVP window remains open; both replacement links and
their sessions are capped at the stored RSVP deadline. HTTP localhost previews
use a development-only cookie name; production retains the Secure `__Host-`
cookie.

The shared Supabase Auth config sets email OTP expiry to 1 hour. Apply
`../website/supabase/config.toml` to the target Supabase project when changing
that expiry remotely.

If production login shows "We could not check your membership right now", first
verify the top-level Cloudflare Worker secrets match the prod Supabase project
ref `qevpnhaycygiyjxeucmj`: `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. A dev key or an API
key rejected by the database API paired with the prod project ref makes the
server-side member lookup fail for every email.

## Supabase

The app migration is in `supabase/migrations/20260613190000_member_app.sql`.
This checkout is linked to `opo-dev` for local Supabase CLI commands:

```bash
supabase db push --yes
```

Before applying production migrations, explicitly relink to the production
project ref from the website README and verify the target with
`cat supabase/.temp/project-ref`.

It assumes the website migrations have already created:

- `profile_registrations`
- `members`
- `benefit_codes`
- `benefit_code_redemptions`
- `credit_ledger_entries`
- `member_credit_balances`
- the website membership RPCs

The website's member-registration/payment-resume migrations are mirrored here
(`20260612110000_add_locale_to_profile_registrations.sql` and
`20260615220000_membership_payment_resume.sql`) so a fresh app migration push has
the same shared schema. Apply website/shared migrations first, then the app
migration to the same project.

Member login is intentionally active-only. Pending members created by the
website after story submission cannot log in until Stripe payment or a free code
marks `members.membership_status = active`.

## Stripe

The app has a dedicated credit-pack checkout endpoint:

- `POST /api/stripe/create-credit-checkout`
- `POST /api/stripe/webhook`

The app webhook only completes sessions where `metadata.purchase = credit_pack`, so it does not process the website membership sessions.

Credit-pack Checkout Sessions enable Stripe automatic tax with automatic billing
address collection. Credit prices in `credit_products.price_amount_cents` are
gross/tax-inclusive, so the displayed package amount remains the customer total
and Stripe splits VAT/tax out of that total when the account has the required
Stripe Tax setup and registrations. Set `STRIPE_CREDIT_TAX_CODE` to apply a
specific Stripe Tax code to inline credit products; otherwise Stripe uses the
preset product tax code configured in Stripe Tax settings.

## Commands

```bash
npm run dev
npm run lint
npm run build
```

## Performance notes

- Member pages stay server-verified, but render-time member context should use
  the cached `*ForRender` helpers so shared layouts and pages do not repeat the
  same Supabase auth/member/profile lookups during one request.
- Keep `loading.tsx` fallbacks for dynamic member routes so client-side
  navigation shows immediate feedback while Server Components stream in.
- Import stable local images from `public/` instead of passing string paths to
  `next/image`; this emits hashed `/_next/static/media/` assets that Cloudflare
  can cache immutably.
- Keep `middleware.ts` for OpenNext Cloudflare. Auth pages stay covered so
  Supabase SSR can refresh cookies; static-safe and clearly public API routes
  stay excluded.
