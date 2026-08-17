# MissionPay payment flows

## Business and provider states

MissionPay donation states are centralized as `pending → processing → succeeded | failed`, with `cancelled` and `refunded` available for later lifecycle events. Provider statuses are mapped in one shared backend module. The browser can display an interim state but cannot set a donation to `succeeded`.

## One-time donation

1. A guest selects a published campaign, one-time frequency, amount, name, email, and anonymity.
2. `create-payment` validates the amount, USD currency, campaign state, and donor fields.
3. It creates a donor, a pending donation, a random confirmation capability, and a payment attempt.
4. The function creates a Hyperswitch payment server-side with automatic capture and returns only the payment ID, `client_secret`, donation ID, and opaque status token.
5. Unified Checkout collects payment details directly inside Hyperswitch-controlled UI.
6. The result is reconciled by a verified webhook and, as a recovery path, by `payment-status` retrieving the provider payment with `force_sync=true`.
7. Only `succeeded` donation rows affect metrics.

## Monthly CIT and setup

1. Monthly is a separate, equally visible frequency. One-time remains the default.
2. The donor sees the exact amount due today and every month and must check an unselected authorization checkbox.
3. `create-payment` creates a Hyperswitch customer and a pending `recurring_donations` row with a SHA-256 hash of a random management token.
4. The initial payment is a customer-initiated payment with `setup_future_usage: "off_session"` and the shared Hyperswitch customer ID.
5. After provider success, MissionPay retrieves/stores only the returned `payment_method_id`, activates the recurring plan, and calculates the next monthly date.
6. The plain management token is returned once to the donor browser and is not recoverable from the database.

## Monthly MIT

1. Supabase Cron invokes `process-recurring-donations` with a dedicated cron secret.
2. The worker selects active plans whose `next_charge_at <= now()`.
3. It inserts a new monthly donation for the scheduled billing date. The database unique constraint is the concurrency guard.
4. It creates a Hyperswitch payment with `confirm: true`, `off_session: true`, and `recurring_details: { type: "payment_method_id", data: ... }` using the same customer and profile as the CIT.
5. Success advances the next date; a missing calendar day falls back to that month’s final day.
6. Failure marks the occurrence failed and the plan `past_due`. Automatic retries/dunning are deferred.

The protected development trigger calls this exact worker path; it never substitutes a fake charge.

## Webhook reconciliation

1. Read the raw request body.
2. Recreate HMAC-SHA512 using the profile payment response hash key.
3. Constant-time compare against `x-webhook-signature-512`.
4. Insert `event_id` into `payment_events`; duplicates return `200` without repeating effects.
5. Resolve the payment attempt and compare provider timestamps to ignore stale out-of-order events.
6. Update the attempt and donation.
7. On a successful initial monthly payment, store the safe payment-method reference and activate the plan.
8. Database triggers refresh safe public metrics and supporter activity.
9. The same succeeded-state boundary queues one donation confirmation outbox row; it never sends inline with reconciliation.

## Donation confirmation email

1. A donation is inserted as or transitions into `succeeded` after the email migration is deployed.
2. A database trigger inserts exactly one `donation_confirmation` delivery using a unique donation/type key. Existing historical successes are not backfilled.
3. Supabase Cron invokes `process-donation-emails` every minute with `x-cron-secret` from Vault.
4. A service-role-only RPC atomically claims at most 25 pending/retryable rows. Concurrent workers cannot claim the same row.
5. The worker queries minimal donation, donor, campaign, and optional recurring-plan business fields; it never reads payment-event payloads or payment credentials.
6. The worker renders escaped HTML and plain text, then calls Resend with `missionpay-donation-confirmation:<donation-id>` as its idempotency key.
7. Success stores only Resend's message ID and sent timestamp. Failure stores a sanitized error category and schedules a bounded retry.

One-time successes receive one confirmation. An initial or future monthly success is a distinct donation row and therefore receives its own confirmation. Monthly status/next date are shown only from reconciled recurring-plan state. Anonymous donors are emailed privately while the message notes their public identity remains Anonymous. Payment success, metrics, and supporter activity never depend on email delivery.

## Failure and retry

- A create-payment failure marks the internal donation failed and tells the donor no charge was made.
- An immediate checkout error remains on the payment step with human-readable provider-safe text.
- A terminal failed status never changes campaign metrics and offers a route back to retry.
- A processing status continues polling without presenting success.
- A future implementation may create attempt 2 on the same business donation; the schema already supports ordered attempts.

## Cancellation

`cancel-recurring-donation` hashes the opaque URL token and looks up the plan server-side. Cancellation is idempotent, sets `status = cancelled` and `cancelled_at`, and preserves every prior donation and event. The scheduler selects only `active` plans.

## Refunds and disputes

Refund UI is deferred. A future verified refund webhook can set a donation to `refunded` and refresh metrics. Dispute and chargeback events can be preserved in `payment_events`; operational workflows and fundraiser controls require a later policy decision.
