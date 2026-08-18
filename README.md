# MissionPay

MissionPay is a two-sided fundraising prototype for trustworthy campaign discovery, guest one-time giving, explicit monthly giving, and fundraiser visibility. Supabase owns business data and authorization; Juspay Hyperswitch hosted sandbox owns payment orchestration.

## What is implemented

- Editorial public landing, campaign discovery, campaign detail, and responsive campaign storytelling
- Guest donation flow with presets/custom amounts, anonymity, review, and recurring consent
- Official Hyperswitch React Unified Checkout with backend-only payment creation
- Backend-authoritative processing, success, failure, retry, and confirmation states
- Monthly CIT setup, scheduled MIT worker, end-of-month-safe dates, and guest cancellation through legacy opaque or backend-signed email capabilities
- Ownership-protected, development-only UI for invoking a real monthly MIT cycle
- Supabase Auth fundraiser signup/login, campaign draft/edit/publish, dashboard metrics, payment visibility, and recurring-support visibility
- Versioned Postgres schema, RLS, explicit Data API grants, idempotent webhooks, and billing-period uniqueness
- Backend-authoritative donation confirmation emails with an internal outbox, bounded retries, and Brevo transactional delivery
- Meaningful seed data: five campaigns and successful donation rows that derive the primary demo’s $12,450 / 183 supporters

## Local setup

Requirements: Node.js 24+, npm, and the Supabase CLI installed from this repository’s pinned dev dependency.

```bash
npm install
cp .env.example .env
npm run dev
```

Set only these browser-safe values in `.env`:

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_HYPERSWITCH_PUBLISHABLE_KEY=
VITE_HYPERSWITCH_BASE_URL=https://sandbox.hyperswitch.io
```

Never add the Hyperswitch API key, Supabase secret key, database password, access token, or webhook signing secret to a `VITE_` variable.

## Supabase setup

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Configure server secrets in Supabase:

```bash
npx supabase secrets set \
  HYPERSWITCH_API_KEY=... \
  HYPERSWITCH_BASE_URL=https://sandbox.hyperswitch.io \
  HYPERSWITCH_PROFILE_ID=... \
  HYPERSWITCH_MERCHANT_ID=... \
  HYPERSWITCH_WEBHOOK_SECRET=... \
  APP_URL=https://your-app.example \
  CRON_SECRET=... \
  BREVO_API_KEY=... \
  DONATION_MANAGEMENT_LINK_SECRET=... \
  MISSIONPAY_EMAIL_FROM_NAME=MissionPay \
  MISSIONPAY_EMAIL_FROM_ADDRESS=... \
  MISSIONPAY_EMAIL_REPLY_TO=... \
  ENABLE_DEV_TRIGGER=false
```

Hosted Edge Functions receive the same-project `SUPABASE_SECRET_KEYS` and legacy `SUPABASE_SERVICE_ROLE_KEY` automatically. Do not override them with a manually copied project key; `SUPABASE_SECRET_KEY` remains only a local/self-hosted compatibility fallback.

Deploy functions:

```bash
npx supabase functions deploy create-payment --no-verify-jwt
npx supabase functions deploy payment-status --no-verify-jwt
npx supabase functions deploy hyperswitch-webhook --no-verify-jwt
npx supabase functions deploy cancel-recurring-donation --no-verify-jwt
npx supabase functions deploy process-recurring-donations --no-verify-jwt
npx supabase functions deploy process-donation-emails --no-verify-jwt
```

These entry points disable the legacy platform JWT gate intentionally and implement their own controls: guest validation, random status/management capabilities, HMAC webhook authentication, or a dedicated cron secret. `process-donation-emails` accepts no recipient or message input and is not a general email relay.

## Hyperswitch setup

Use the hosted sandbox base URL `https://sandbox.hyperswitch.io`. In the Hyperswitch profile, configure the outgoing webhook URL:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/hyperswitch-webhook
```

Use the profile’s payment response hash key as `HYPERSWITCH_WEBHOOK_SECRET`. Enable the intended card connector and only enable wallets that the account/browser can actually use; Unified Checkout handles capability display.

## Scheduler

Supabase’s current recommended hosted architecture combines Cron (`pg_cron`) and `pg_net`. The committed scheduler migration stores no credentials; it reads the project URL and dedicated cron credential from Vault and posts to `/functions/v1/process-recurring-donations` daily at 08:15 UTC. Do not place the Hyperswitch API key in the cron job.

The donation-email migration schedules `/functions/v1/process-donation-emails` every minute with the same protected Vault credential. A database trigger queues only donations that newly enter `succeeded` after the migration is installed; it does not backfill historical successes. The worker derives the recipient from current trusted donor state, reads only donation/campaign business fields, renders HTML and text, and sends through Brevo's Transactional Email API. Configure `BREVO_API_KEY`, `DONATION_MANAGEMENT_LINK_SECRET`, `MISSIONPAY_EMAIL_FROM_NAME`, and `MISSIONPAY_EMAIL_FROM_ADDRESS` only as Supabase Edge Function secrets. `MISSIONPAY_EMAIL_REPLY_TO` is optional.

Set `DONATION_MANAGEMENT_LINK_SECRET` to a cryptographically random value of at least 32 bytes. It is a backend-only HMAC key used only while recurring-management links are rendered; it must never use a `VITE_` prefix, enter Postgres, or be logged. Configure it with a securely generated value:

```bash
npx supabase secrets set DONATION_MANAGEMENT_LINK_SECRET=...
```

For the zero-cost prototype, create or sign in to Brevo, create an API key for transactional sending, add a MissionPay sender, and complete Brevo's sender verification. If its domain is not authenticated, Brevo sends a six-digit code to the sender address. A controlled free-mailbox address such as Gmail can be used for this prototype if the current Brevo account permits it, but that domain cannot be authenticated. Brevo may rewrite a free or unauthenticated From address to an authenticated Brevo sending domain for deliverability, so this does not provide the sender branding or deliverability quality of a custom authenticated domain. A custom domain is a future production enhancement, not a requirement for this MVP. Never commit or expose the API key through a `VITE_` variable.

After configuring the secrets, deploy the changed `process-donation-emails` and `cancel-recurring-donation` functions, then create a new sandbox donation using the intended donor inbox. Verify the donation is `succeeded`, one outbox row is claimed and marked `sent`, Brevo accepted it, and the donor actually received it. Do not requeue exhausted pre-Brevo rows or backfill historical donations for this test.

Email delivery is independent of payment state: missing configuration, provider outages, or delivery failures leave the donation succeeded and affect only the outbox. Transient failures are retryable within the bounded worker policy. Sandbox confirmations identify themselves as tests and state that no real money moved.

## Verification

```bash
npm run lint
npm test
npm run build
```

Before a demo, verify:

1. One-time sandbox success changes both campaign and dashboard totals.
2. A failing sandbox payment does not change totals and can be retried.
3. Monthly checkout displays unselected explicit consent and stores a payment method after success.
4. The protected development trigger runs the real MIT worker and creates a second donation/payment.
5. Sending the same webhook twice creates one payment event and one state transition.
6. Each initial and subsequent successful monthly charge receives its own receipt and secure management link.
7. Cancellation requires the in-app affirmative confirmation, prevents the next worker run, and preserves history.

### Monthly donation golden path

1. Create a monthly sandbox donation, complete Hyperswitch checkout, and confirm the donation succeeds and the plan becomes active.
2. Confirm the first receipt is delivered with the monthly amount, next donation date, and **Manage monthly donation** link.
3. Use the ownership-protected development recurring-cycle trigger to run one additional cycle. Confirm Hyperswitch creates an off-session payment without card re-entry, exactly one new succeeded donation is recorded, totals update once, and a second receipt with a management link arrives.
4. Open the management link and confirm campaign, monthly amount, status, start date, and next charge display.
5. Click **Cancel monthly donation**, choose **No**, and confirm the plan remains active.
6. Start cancellation again, choose **Yes**, and confirm the plan is cancelled while both historical donations remain.
7. Trigger another development cycle and confirm no payment or donation is created for the cancelled plan.

## Documentation

- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Payment flows](docs/PAYMENT_FLOWS.md)

## Security note

Secrets supplied for setup are deliberately absent from tracked files. Rotate any secret that has been shared outside its intended secure channel before production use.
