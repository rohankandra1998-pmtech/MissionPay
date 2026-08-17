# MissionPay

MissionPay is a two-sided fundraising prototype for trustworthy campaign discovery, guest one-time giving, explicit monthly giving, and fundraiser visibility. Supabase owns business data and authorization; Juspay Hyperswitch hosted sandbox owns payment orchestration.

## What is implemented

- Editorial public landing, campaign discovery, campaign detail, and responsive campaign storytelling
- Guest donation flow with presets/custom amounts, anonymity, review, and recurring consent
- Official Hyperswitch React Unified Checkout with backend-only payment creation
- Backend-authoritative processing, success, failure, retry, and confirmation states
- Monthly CIT setup, scheduled MIT worker, end-of-month-safe dates, and opaque-token cancellation
- Ownership-protected, development-only UI for invoking a real monthly MIT cycle
- Supabase Auth fundraiser signup/login, campaign draft/edit/publish, dashboard metrics, payment visibility, and recurring-support visibility
- Versioned Postgres schema, RLS, explicit Data API grants, idempotent webhooks, and billing-period uniqueness
- Backend-authoritative donation confirmation emails with an internal outbox, bounded retries, and Resend idempotency
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
  RESEND_API_KEY=... \
  MISSIONPAY_EMAIL_FROM='MissionPay <donations@your-verified-domain.example>' \
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

The donation-email migration schedules `/functions/v1/process-donation-emails` every minute with the same protected Vault credential. A database trigger queues only donations that newly enter `succeeded` after the migration is installed; it does not backfill historical successes. The worker reads only current donor/campaign/donation business fields, renders HTML and text, and sends through Resend. Configure `RESEND_API_KEY` and a verified `MISSIONPAY_EMAIL_FROM` in Supabase Edge Function secrets. `MISSIONPAY_EMAIL_REPLY_TO` is optional. Resend requires sender-domain verification for custom domains.

Email delivery is independent of payment state: missing configuration, provider outages, or delivery failures leave the donation succeeded and the outbox retryable. Sandbox confirmations identify themselves as tests and state that no real money moved.

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
6. Cancellation prevents the next worker run while preserving history.

## Documentation

- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Payment flows](docs/PAYMENT_FLOWS.md)

## Security note

Secrets supplied for setup are deliberately absent from tracked files. Rotate any secret that has been shared outside its intended secure channel before production use.
