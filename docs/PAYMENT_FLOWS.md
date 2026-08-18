# MissionPay payment flows

## Business and provider states

MissionPay donation states are centralized as `pending → processing → succeeded | failed`, with `cancelled` and `refunded` available for later lifecycle events. Provider statuses are mapped in one shared backend module. The browser can display an interim state but cannot set a donation to `succeeded`.

## One-time donation

1. A guest selects a published campaign, one-time frequency, amount, name, email, and anonymity.
2. `create-payment` validates the amount, USD currency, campaign state, and donor fields.
3. It creates a donor, a pending donation, a random confirmation capability, and a payment attempt.
4. The function creates a Hyperswitch payment server-side with automatic capture and returns only the payment ID, `client_secret`, donation ID, and opaque status token.
5. Unified Checkout collects payment details directly inside Hyperswitch-controlled UI. Confirmation uses `redirect: "if_required"`: redirect and 3DS methods stay SDK-controlled, while direct methods return control to MissionPay.
6. An immediate SDK error remains on the payment step, is mapped to MissionPay-owned copy, and starts a non-blocking `payment-status` sync with the donation's capability token. Retry is available during that sync; if the backend returns a more specific normalized reason, the inline copy is enriched without displaying the SDK or provider message. A direct result without an error navigates to the status route regardless of its SDK status; the browser never declares success.
7. The result is reconciled by a verified webhook and, as a recovery path, by `payment-status` retrieving the provider payment with `force_sync=true&expand_attempts=true`.
8. Only `succeeded` donation rows affect metrics.

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
6. The worker renders escaped HTML and plain text, then calls `POST https://api.brevo.com/v3/smtp/email` with the server-only `api-key` header. The payload contains the configured sender, trusted donor recipient, fixed confirmation subject/bodies, optional reply-to, and the stable delivery UUID in `headers.idempotencyKey`.
7. Success stores only Brevo's `messageId` and sent timestamp. Failure stores a sanitized `brevo_http_<status>` or configuration/network category and schedules a bounded retry. Authentication and malformed/configuration failures are classified non-retryable and exhaust that row rather than tight-looping; 408, 429, network failures, and 5xx remain retryable up to the existing five-attempt limit.

One-time successes receive one confirmation. An initial or future monthly success is a distinct donation row and therefore receives its own confirmation. Monthly status/next date are shown only from reconciled recurring-plan state. Anonymous donors are emailed privately while the message notes their public identity remains Anonymous. Payment success, metrics, and supporter activity never depend on email delivery.

The database unique donation/type key, atomic `FOR UPDATE SKIP LOCKED` claim, and terminal `sent` state are the durable idempotency guarantees. Brevo's provider-level guard reuses the stable delivery UUID on retries, but its documented TTL is only 30 minutes, so MissionPay does not treat it as a durable replacement.

## Failure and retry

- A create-payment failure marks the internal donation failed and tells the donor no charge was made.
- An immediate checkout error remains on the payment step with MissionPay-owned reason copy. The client prefers exact machine fields, permits only a narrow allowlist of documented Dummy connector scenario labels when the SDK exposes no code, never renders or persists raw messages, and emits only the normalized taxonomy in analytics.
- Reconciliation maps Hyperswitch's unified, connector, issuer, and authoritative latest-attempt fields into MissionPay's constrained `failure_reason` taxonomy. Expanded attempts are ordered by their documented modification/creation timestamps, with the last valid array entry as a safe tie fallback. The authoritative attempt precedes top-level last-attempt mirrors because retries can leave older compatibility fields.
- `requires_payment_method` alone remains a non-terminal checkout state: a newly created payment without a submitted method stays `processing`. When that same provider status is accompanied by a terminal authoritative attempt, documented last-failed-attempt fields, structured error details, or Hyperswitch's explicit manual-retry failure indicator, MissionPay treats the confirmation as `failed`. The canonical sanitized evidence then supplies the normalized reason, falling back to `unknown` rather than polling indefinitely.
- Machine-readable inputs are preferred: `standardised_code`/`standardized_code`, `category`, `unified_code`, connector and issuer codes, `error_code`, `issuer_error_code`, `status`, and `cancellation_reason`. The backend also inspects documented unified `message`, `description`, and `user_guidance_message`; connector `message` and `reason`; issuer `message`; and top-level compatibility messages, but only through normalized exact-value allowlists. It does not use substring/fuzzy matching or expose those strings. This narrow text fallback includes the hosted Fauxpay wrapper observed in sandbox (`Payment declined: <documented Dummy label>`) when no discriminating machine code is available.
- In the installed `@juspay-tech/hyper-js` 2.1.0 contract, an immediate error formally exposes `error.type` and `error.message`, while a direct successful response exposes top-level `status` and optional `next_action`. MissionPay narrows any runtime machine-code additions defensively; `next_action` redirect signals stay SDK-owned, and every no-error direct status goes to backend reconciliation.
- Hyperswitch documents `4000000000009995` as its insufficient-funds Dummy scenario, while hosted Fauxpay currently returns the exact `fauxpay` + `DC_08` + `UE_9000` + connector-error fingerprint observed in sandbox. A removable, connector-scoped adapter maps only that complete sanitized fingerprint to `insufficient_funds`; either code alone and arbitrary internal-error prose remain `unknown`. MissionPay never reads the card number—the documented number explains the upstream mismatch but is not runtime classification input.
- Failed/cancelled reconciliation persists the same canonical sanitized evidence used by the classifier in backend-only `payment_attempts.provider_failure_snapshot`. It contains only present allowlisted status, connector/code, structured unified/connector/issuer detail, and authoritative-attempt fields. It omits full attempts history, card/payment-method data, secrets, donor/billing data, and risk payloads. Arbitrary top-level `error_message` is no longer retained; recognized compatibility messages and structured detail messages exist only inside the controlled snapshot.
- The public `payment-status` response returns only the normalized reason (`insufficient_funds`, `card_declined`, `lost_card`, `stolen_card`, `card_unavailable`, `authentication_failed`, `invalid_cvv`, `expired_card`, `invalid_card`, `payment_cancelled`, `session_expired`, `technical_error`, or `unknown`). It never returns raw error messages, risk/fraud details, payment-method references, client secrets, or event payloads.
- A terminal failed status never changes campaign metrics and offers safe, reason-specific guidance plus a direct route to restart checkout. A failed/cancelled latest attempt with a missing or `unknown` reason receives a short-lived atomic lease for one `force_sync` enrichment retrieve. A successful retrieve records `failure_enrichment_attempted_at`; a transient failure releases the lease, and abandoned leases expire, so later requests may retry without unbounded polling. A richer retrieve replaces an earlier weak snapshot and normalized reason.
- A processing status continues polling without presenting success.
- A future implementation may create attempt 2 on the same business donation; the schema already supports ordered attempts.

Sandbox verification should use Hyperswitch's documented Dummy connector scenarios manually after deployment. Test card numbers are secure checkout inputs only and must never be embedded in application logic or fixtures. Hyperswitch remains the source of payment state, and the backend remains authoritative for every terminal result.

### Sandbox failure diagnostics

The persisted backend-only snapshot is the primary sandbox diagnostic. The optional `HYPERSWITCH_FAILURE_DIAGNOSTICS=true` sandbox-only log remains available when evidence is needed before database reconciliation; deploy the payment functions, submit the documented Dummy scenario through the Hyperswitch Payment Element, and inspect only the sanitized diagnostic.

The diagnostic contains only payment/attempt IDs, statuses, connector names, timestamps, approved error codes, and the documented unified/connector/issuer detail fields. It excludes PAN, CVV, secrets, payment tokens/references, donor data, risk payloads, and the full response. For each scenario, record which field on the newest attempt differs—especially connector `code`, `message`, or `reason`, issuer `code`, unified standardized code/guidance, and top-level compatibility codes. If lost and stolen produce only the shared `CARD_LOST_OR_STOLEN` classification or the same blocked-card guidance, MissionPay must safely retain `card_unavailable`; it distinguishes them only when Hyperswitch returns an exact `lost_card`/`lost card` or `stolen_card`/`stolen card` signal. Set the flag back to `false` and redeploy after verification.

## Cancellation

`cancel-recurring-donation` hashes the opaque URL token and looks up the plan server-side. Cancellation is idempotent, sets `status = cancelled` and `cancelled_at`, and preserves every prior donation and event. The scheduler selects only `active` plans.

## Refunds and disputes

Refund UI is deferred. A future verified refund webhook can set a donation to `refunded` and refresh metrics. Dispute and chargeback events can be preserved in `payment_events`; operational workflows and fundraiser controls require a later policy decision.
