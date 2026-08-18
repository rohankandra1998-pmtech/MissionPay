import { describe, expect, it } from "vitest";
import paymentStatusSource from "../../supabase/functions/payment-status/index.ts?raw";
import reconcileSource from "../../supabase/functions/_shared/reconcile.ts?raw";
import migrationSource from "../../supabase/migrations/20260817234027_persist_hyperswitch_failure_evidence.sql?raw";
import { buildPaymentAttemptUpdate, extractPaymentFailureEvidence, normalizePaymentFailureEvidence } from "../../supabase/functions/_shared/paymentFailure";

const messages = {
  insufficient_funds: "Payment declined: Insufficient funds",
  card_declined: "Payment declined: Card declined",
  lost_card: "Payment declined: Lost card",
  stolen_card: "Payment declined: Stolen card",
} as const;
const fauxpayInsufficientFundsMessage = "Payment declined: Internal Server Error from Connector, Please try again later";

function providerFailure(message: string, extra: Record<string, unknown> = {}) {
  return {
    payment_id: "pay_test",
    status: "failed",
    connector: "fauxpay",
    error_code: "DC_08",
    unified_code: "UE_9000",
    error_message: "arbitrary top-level provider prose",
    client_secret: "secret_private",
    payment_method: { card: { number: "4111111111111111", expiry_month: "12", expiry_year: "30", cvv: "123" } },
    payment_token: "token_private",
    email: "donor@example.com",
    billing: { name: "Private Donor" },
    risk_details: { rule: "private" },
    error_details: {
      unified_details: { category: "UE_9000", message: "Something went wrong" },
      connector_details: { code: "DC_08", message },
    },
    attempts: [{
      attempt_id: "attempt-latest",
      status: "failure",
      connector: "fauxpay",
      error_code: "DC_08",
      unified_code: "UE_9000",
      created_at: "2026-08-17T22:00:00Z",
      error_details: {
        unified_details: { category: "UE_9000", message: "Something went wrong" },
        connector_details: { code: "DC_08", message },
      },
      payment_token: "attempt_token_private",
      card: { number: "4111111111111111", cvv: "123" },
    }],
    ...extra,
  };
}

describe("payment failure evidence persistence", () => {
  it.each(Object.entries(messages))("builds the persisted %s Fauxpay evidence", (expected, message) => {
    const persistedUpdate = buildPaymentAttemptUpdate(providerFailure(message), "failed");

    expect(persistedUpdate).toMatchObject({
      status: "failed",
      error_code: "DC_08",
      error_message: null,
      failure_reason: expected,
      provider_failure_snapshot: {
        status: "failed",
        connector: "fauxpay",
        error_code: "DC_08",
        unified_code: "UE_9000",
        error_details: { connector_details: { code: "DC_08", message } },
        authoritative_attempt: {
          attempt_id: "attempt-latest",
          status: "failure",
          error_details: { connector_details: { code: "DC_08", message } },
        },
      },
    });
  });

  it("strips secrets, card data, donor details, risk payloads, and arbitrary top-level prose", () => {
    const snapshot = extractPaymentFailureEvidence(providerFailure("Issuer internal narrative"));
    const serialized = JSON.stringify(snapshot);

    expect(normalizePaymentFailureEvidence(snapshot)).toBe("unknown");
    expect(serialized).toContain("Issuer internal narrative");
    expect(serialized).not.toMatch(/4111111111111111|\"cvv\"|secret_private|token_private|donor@example|Private Donor|risk_details|arbitrary top-level provider prose/);
    expect(snapshot).not.toHaveProperty("attempts");
    expect(snapshot).toHaveProperty("authoritative_attempt.attempt_id", "attempt-latest");
  });

  it("drops an allowlisted message field when its value itself contains sensitive data", () => {
    const snapshot = extractPaymentFailureEvidence(providerFailure("ignored", {
      error_details: {
        connector_details: {
          code: "DC_08",
          message: "Declined PAN 4111 1111 1111 1111",
          reason: "CVV: 123 client_secret=pay_secret_private",
        },
        issuer_details: { code: "05", message: "Contact donor@example.com" },
      },
      attempts: [],
    }));

    expect(snapshot).toMatchObject({ error_details: { connector_details: { code: "DC_08" }, issuer_details: { code: "05" } } });
    expect(JSON.stringify(snapshot)).not.toMatch(/4111|CVV|client_secret|donor@example/);
  });

  it("lets a richer retrieve replace an earlier unknown snapshot", () => {
    const weakUpdate = buildPaymentAttemptUpdate(providerFailure("Unrecognized connector narrative"), "failed");
    const enrichedUpdate = buildPaymentAttemptUpdate(providerFailure(messages.insufficient_funds), "failed");

    expect(weakUpdate).toMatchObject({ failure_reason: "unknown" });
    expect(enrichedUpdate).toMatchObject({
      failure_reason: "insufficient_funds",
      provider_failure_snapshot: {
        authoritative_attempt: { error_details: { connector_details: { message: messages.insufficient_funds } } },
      },
    });
  });

  it("persists insufficient funds for the exact Fauxpay sandbox compatibility fingerprint", () => {
    expect(buildPaymentAttemptUpdate(providerFailure(fauxpayInsufficientFundsMessage), "failed")).toMatchObject({
      status: "failed",
      error_code: "DC_08",
      error_message: null,
      failure_reason: "insufficient_funds",
      provider_failure_snapshot: {
        connector: "fauxpay",
        error_code: "DC_08",
        unified_code: "UE_9000",
        authoritative_attempt: {
          connector: "fauxpay",
          error_details: { connector_details: { code: "DC_08", message: fauxpayInsufficientFundsMessage } },
        },
      },
    });
  });

  it("keeps the snapshot backend-only and releases failed enrichment claims for retry", () => {
    expect(migrationSource).toContain("provider_failure_snapshot jsonb");
    expect(migrationSource).toContain("failure_enrichment_claimed_at timestamptz");
    expect(migrationSource).toContain("revoke select on table public.payment_attempts from authenticated");
    expect(paymentStatusSource).toContain('from("payment_attempts").select("failure_reason")');
    expect(paymentStatusSource).not.toContain('select("provider_failure_snapshot")');
    expect(paymentStatusSource).toContain("await releaseFailureEnrichment");
    expect(paymentStatusSource.indexOf("await reconcilePayment")).toBeLessThan(paymentStatusSource.indexOf("await completeFailureEnrichment"));
    expect(reconcileSource).toContain("update(buildPaymentAttemptUpdate(providerPayment, status))");
  });
});
