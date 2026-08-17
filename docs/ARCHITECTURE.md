# MissionPay architecture

MissionPay separates fundraising business state from payment orchestration. Supabase owns fundraiser identity, campaigns, donors, donations, recurring schedules, reporting, and access control. Hyperswitch owns payment collection and processor state. The browser receives a short-lived `client_secret` and never receives either server secret.

## System map

```text
React + Vite
  ├─ public campaign reads ──────────────> Supabase Data API + RLS
  ├─ fundraiser CRUD + auth ─────────────> Supabase Auth + Data API + RLS
  └─ guest checkout
       └─ create-payment Edge Function
            ├─ validates campaign and amount
            ├─ creates MissionPay business records
            └─ POST /payments ───────────> Hyperswitch sandbox
                    │
                    └─ client_secret ────> Unified Checkout iframe

Hyperswitch outgoing webhook
  └─ hyperswitch-webhook Edge Function
       ├─ verifies HMAC-SHA512 over the raw body
       ├─ deduplicates by event_id
       ├─ ignores stale provider updates
       └─ reconciles attempt, donation, recurring plan, and campaign metrics

Supabase Cron + pg_net
  ├─ process-recurring-donations
       ├─ claims one unique billing period in Postgres
       ├─ creates a new donation row
       └─ creates a Hyperswitch off-session MIT
  └─ process-donation-emails
       ├─ atomically claims a bounded internal outbox batch
       ├─ reads minimal confirmed MissionPay business data
       └─ sends HTML + text confirmation ───────────> Brevo Transactional Email API
```

## Frontend

- React 19, TypeScript, Vite, React Router, Tailwind CSS, and a custom MissionPay visual system.
- Route-level lazy loading keeps fundraiser and payment SDK code out of the first landing-page chunk.
- Supabase publishable keys are the only Supabase keys available to browser code.
- The donation flow collects no card data. The official Hyperswitch `PaymentElement` renders the secure payment UI.
- Unified Checkout uses `redirect: "if_required"`. The SDK owns required redirects/3DS; direct no-error results go to MissionPay's status route, where success is decided exclusively from reconciled backend state.
- Immediate SDK errors stay inline and trigger a best-effort background `payment-status` reconciliation using the random status token stored only in the browser session. That sync never blocks a retry, and redirect query parameters are not trusted.
- Failed confirmations render from a MissionPay-owned normalized reason. Client analytics contain only donation ID plus the safe taxonomy; browser and status views never render connector, issuer, risk, or arbitrary SDK messages.
- The fundraiser dashboard derives totals from rows returned under RLS; it does not contain demo financial constants.

## Database relationships

```text
auth.users 1──1 fundraisers 1──* campaigns 1──* donations *──1 donors
                                      │              │
                                      │              ├──* payment_attempts 1──* payment_events
                                      │              │
                                      └──* recurring_donations 1──* monthly donation occurrences
```

`campaign_metrics` and `public_supporter_activity` are projection tables maintained by internal trigger functions. They expose safe, fast public reads while their values remain derived from `donations.status = 'succeeded'` and active recurring plans.

`payment_attempts.failure_reason` is a constrained, provider-neutral classification written during reconciliation. The normalizer reads documented unified, connector, issuer, and expanded attempt-level machine fields; the newest timestamped attempt is authoritative. Ambiguous `UE_9000` and `DC_08` remain `unknown`. Raw provider diagnostics remain backend-only; the capability-protected status endpoint selects only this normalized field for failed or cancelled donations and falls back to `unknown` for historical attempts.

`donation_email_deliveries` is a backend-only outbox. The donation trigger inserts one row when a donation is inserted as `succeeded` or transitions into `succeeded`; migration installation does not touch historical rows. A unique `(donation_id, notification_type)` key makes repeated reconciliation idempotent. The worker claim RPC uses `FOR UPDATE SKIP LOCKED`, marks rows `sending`, and reclaims abandoned work after ten minutes. Once a row is `sent`, it is never automatically claimed again.

MissionPay's durable database controls remain the primary idempotency boundary. As a supplemental provider guard, each Brevo request includes the stable outbox delivery UUID as `headers.idempotencyKey`. Brevo documents a 30-minute TTL and rejects reuse within that window with `duplicate_parameter`; the same UUID is reused on retries. This provider window is useful but is not a replacement for the durable outbox.

## RLS strategy

RLS is enabled on every table in the exposed `public` schema.

- Anonymous users can read published campaigns, public fundraiser fields, aggregate campaign metrics, and redacted supporter activity.
- Authenticated fundraisers can create and update only campaigns associated with their own `auth.uid()`.
- Fundraisers can read donors, donations, recurring plans, and attempts only through campaigns they own.
- No client role can read `payment_events` or write financial records.
- No anonymous or authenticated client can read or mutate email deliveries or execute the worker claim RPC.
- Edge Functions use a server secret only after validating their caller or an opaque capability token.
- Authorization never depends on user-editable `user_metadata`; ownership is stored in `fundraisers.user_id`.

Private trigger functions live in the unexposed `private` schema with an empty `search_path`, and execute permission is revoked from browser roles.

## Payment security

- Amounts are integer cents and revalidated server-side against $1–$10,000 bounds.
- Campaign status and currency are fetched server-side.
- Raw PAN, CVV, and full payment-instrument data never enter MissionPay.
- Hyperswitch API keys and webhook secrets exist only as Edge Function secrets.
- Hyperswitch request exceptions use a generic log-safe message. Provider response messages are never emitted into browser responses or routine function logs.
- Webhooks use the current Hyperswitch `x-webhook-signature-512` HMAC-SHA512 contract.
- `payment_events.provider_event_id` makes delivery idempotent.
- `provider_updated_at` prevents an older webhook from rolling state backwards.
- A unique `(recurring_donation_id, billing_period_start)` index prevents a double monthly charge when workers overlap.
- Cancellation changes future scheduling only; historical donations remain immutable.
- Recurring schedules preserve the donor's anonymity choice and an immutable consent timestamp for every future occurrence.

## Confirmation email security

Email delivery begins only at the database boundary where backend reconciliation changes a donation into `succeeded`. The worker selects the donor name/email, donation amount/currency/frequency/anonymity/completion time, campaign title/slug, donation ID, and—when monthly—the recurring status/next date. Dynamic HTML is escaped. It does not query `payment_events` or select card data, provider secrets, `client_secret`, payment-method references, access/management/status tokens, or raw provider responses. Donor email/name and rendered bodies are not logged or stored in the outbox.

Delivery failure updates only the outbox. It cannot roll back donation success, campaign metrics, supporter activity, or recurring payment reconciliation. Failed work retries with bounded exponential delays for at most five claimed attempts.

## Deployment

1. Apply the committed migration to the Supabase project.
2. Configure Edge Function secrets and deploy payment functions plus `process-donation-emails`.
3. Configure the Hyperswitch profile webhook URL to `/functions/v1/hyperswitch-webhook` and ensure its signing key matches `HYPERSWITCH_WEBHOOK_SECRET`.
4. Store project URL, publishable key, and `CRON_SECRET` in Supabase Vault; schedule `process-recurring-donations` with `pg_cron` and `pg_net`.
5. Configure `BREVO_API_KEY`, `MISSIONPAY_EMAIL_FROM_NAME`, `MISSIONPAY_EMAIL_FROM_ADDRESS`, and optional `MISSIONPAY_EMAIL_REPLY_TO` as Edge Function secrets. Register and verify that sender in Brevo first. The migration schedules the email worker with the existing Vault URL and cron secret.
6. Configure the Vite public variables in Vercel and deploy the built application.
7. Run one-time, initial monthly, subsequent MIT, failure, duplicate-webhook, email confirmation, and cancellation golden paths.

## Deferred lifecycle work

The schema already supports `refunded` donations and arbitrary payment event types. Refund initiation, partial refunds, dispute workflows, chargeback administration, dunning, multi-merchant settlement, KYB, and payouts remain intentionally deferred.

## Current references

- [Hyperswitch payment server setup](https://docs.hyperswitch.io/explore-hyperswitch/payment-experience/payment/server-setup)
- [Hyperswitch React integration](https://docs.hyperswitch.io/explore-hyperswitch/payment-experience/payment/web/react-with-rest-api-integration)
- [Hyperswitch recurring payment flows](https://api-reference.hyperswitch.io/v1/payments/payment--flows)
- [Hyperswitch webhook verification](https://docs.hyperswitch.io/explore-hyperswitch/payment-orchestration/quickstart/webhooks)
- [Hyperswitch unified error codes](https://api-reference.hyperswitch.io/essentials/error_codes)
- [Hyperswitch payment retrieve fields and expanded attempts](https://api-reference.hyperswitch.io/v1/payments/payments--retrieve)
- [Hyperswitch React SDK `confirmPayment`](https://docs.hyperswitch.io/learn-more/sdk-reference/react)
- [Hyperswitch dummy connector test payments](https://docs.hyperswitch.io/explore-hyperswitch/payment-flows-and-management/quickstart/connectors/test-a-payment-with-connector)
- [Supabase scheduled Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Brevo transactional email endpoint](https://developers.brevo.com/reference/send-transac-email)
- [Brevo transactional email idempotency](https://developers.brevo.com/docs/heterogenous-versions-batch-emails)
- [Brevo sender setup and verification](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email)
- [Brevo free/unauthenticated sender rewriting](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders)
