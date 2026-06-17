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
- `SUPABASE_SECRET_KEY`
- `APP_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET` or `APP_STRIPE_WEBHOOK_SECRET`

Local development is configured to use the Supabase development project:

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

The ignored `.env.local` file contains the matching dev publishable key and
server-only Supabase secret API key. Use `.env.example` only as the template for new
checkouts; do not commit real keys.

Supabase Auth redirects for the dev project allow the member app callbacks:

- `http://localhost:3000/**`
- `http://127.0.0.1:3000/**`

Local login links should come back to `http://localhost:3000/auth/callback`.
If a new local login email opens `https://oneplusoneclub.com`, verify the app is
running with `.env.local` and that the dev Auth config has been pushed.

Login uses Supabase Auth email OTP. The Supabase email template must include
both the one-time token and confirmation URL so members can enter the code or
tap the backup link.

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
- Keep `middleware.ts` for OpenNext Cloudflare, but avoid broad middleware work
  on public/callback/static-safe routes.
