import { describe, expect, it } from "vitest";
import paymentStatusSource from "../../supabase/functions/payment-status/index.ts?raw";
import failureMigrationSource from "../../supabase/migrations/20260817222033_improve_hyperswitch_decline_reasons.sql?raw";
import { normalizePaymentFailure, sanitizePaymentFailureDiagnostic } from "../../supabase/functions/_shared/paymentFailure";

const fauxpayInsufficientFundsMessage = "Payment declined: Internal Server Error from Connector, Please try again later";

function fauxpayInsufficientFundsFingerprint(extra: Record<string, unknown> = {}) {
  return {
    status: "failed",
    connector: "fauxpay",
    error_code: "DC_08",
    unified_code: "UE_9000",
    error_details: {
      unified_details: { category: "UE_9000", message: "Something went wrong" },
      connector_details: { code: "DC_08", message: fauxpayInsufficientFundsMessage },
    },
    ...extra,
  };
}

describe("payment failure normalization", () => {
  it.each([
    ["INSUFFICIENT_FUNDS", "insufficient_funds"],
    ["DO_NOT_HONOR", "card_declined"],
    ["CARD_LOST_OR_STOLEN", "card_unavailable"],
    ["CARD_NOT_SUPPORTED_RESTRICTED", "card_unavailable"],
    ["AUTHENTICATION_FAILED", "authentication_failed"],
    ["INVALID_CVV", "invalid_cvv"],
    ["INVALID_CARD_NUMBER", "invalid_card"],
    ["PAYMENT_CANCELLED_BY_USER", "payment_cancelled"],
    ["PAYMENT_SESSION_TIMEOUT", "session_expired"],
    ["DOWNSTREAM_TECHNICAL_ISSUE", "technical_error"],
  ])("maps the unified code %s", (standardisedCode, expected) => {
    expect(normalizePaymentFailure({
      status: "failed",
      error_details: { unified_details: { category: "UE_1000", standardised_code: standardisedCode } },
    })).toBe(expected);
  });

  it("uses exact machine-code fallbacks without exposing provider messages", () => {
    const providerResponse = {
      status: "failed",
      error_code: "expired_card",
      error_message: "private issuer and risk detail",
      payment_method_id: "pm_private",
      client_secret: "secret_private",
    };

    expect(normalizePaymentFailure(providerResponse)).toBe("expired_card");
    expect(normalizePaymentFailure({ status: "failed", error_message: "insufficient funds" })).toBe("insufficient_funds");
    expect(normalizePaymentFailure({ status: "failed", error_message: "Issuer says insufficient funds after risk review" })).toBe("unknown");
  });

  it("classifies unified platform categories without exposing their detail", () => {
    expect(normalizePaymentFailure({ error_details: { unified_details: { category: "UE_3000", description: "private PSP detail" } } })).toBe("technical_error");
    expect(normalizePaymentFailure({ status: "failed", error_code: "unrecognized_code" })).toBe("unknown");
  });

  it.each([
    [{ error_details: { connector_details: { code: "insufficient_funds", message: "private" } } }, "insufficient_funds"],
    [{ error_details: { issuer_details: { code: "lost_card", message: "private" } } }, "lost_card"],
    [{ issuer_error_code: "invalid_cvv", issuer_error_message: "private" }, "invalid_cvv"],
    [{ error_details: { unified_details: { standardized_code: "INVALID_EXPIRY_DATE" } } }, "invalid_card"],
  ])("reads documented structured error layers", (providerResponse, expected) => {
    expect(normalizePaymentFailure(providerResponse)).toBe(expected);
  });

  it.each([
    [{ error_message: "  Insufficient   Funds " }, "insufficient_funds"],
    [{ error_details: { connector_details: { reason: "Card Declined" } } }, "card_declined"],
    [{ error_details: { connector_details: { message: "Lost Card" } } }, "lost_card"],
    [{ error_details: { issuer_details: { message: "Stolen Card" } } }, "stolen_card"],
    [{ error_details: { unified_details: { message: "Restricted Card" } } }, "card_unavailable"],
    [{ error_details: { unified_details: { description: "Invalid CVV" } } }, "invalid_cvv"],
    [{ error_details: { unified_details: { user_guidance_message: "There aren't enough funds on this card. Use another card or add funds and try again" } } }, "insufficient_funds"],
  ])("uses the exact allowlist for documented text field %j", (providerResponse, expected) => {
    expect(normalizePaymentFailure(providerResponse)).toBe(expected);
  });

  it.each([
    ["Payment declined: Card declined", "card_declined"],
    ["Payment declined: Insufficient funds", "insufficient_funds"],
    ["Payment declined: Lost card", "lost_card"],
    ["Payment declined: Stolen card", "stolen_card"],
  ])("normalizes the exact hosted Fauxpay connector message %s", (message, expected) => {
    const observedRetrieveShape = {
      status: "failed",
      error_code: "DC_08",
      unified_code: "UE_9000",
      error_details: {
        unified_details: { category: "UE_9000", message: "Something went wrong" },
        connector_details: { code: "DC_08", message, reason: null },
      },
      attempts: [{
        attempt_id: "latest",
        status: "failure",
        created_at: "2026-08-17T22:45:00Z",
        error_code: "DC_08",
        unified_code: "UE_9000",
        error_details: {
          unified_details: { category: "UE_9000", message: "Something went wrong" },
          connector_details: { code: "DC_08", message, reason: null },
        },
      }],
    };

    expect(normalizePaymentFailure(observedRetrieveShape)).toBe(expected);
  });

  it("reads an exact Dummy label from the documented top-level unified_message compatibility field", () => {
    expect(normalizePaymentFailure({ status: "failed", unified_message: "Payment declined: Lost card" })).toBe("lost_card");
  });

  it("maps only the complete observed Fauxpay sandbox fingerprint to insufficient funds", () => {
    expect(normalizePaymentFailure(fauxpayInsufficientFundsFingerprint())).toBe("insufficient_funds");
    expect(normalizePaymentFailure({
      status: "failed",
      attempts: [{
        attempt_id: "latest",
        ...fauxpayInsufficientFundsFingerprint(),
        status: "failure",
      }],
    })).toBe("insufficient_funds");
  });

  it.each([
    ["the same codes without the message", { connector: "fauxpay", error_code: "DC_08", unified_code: "UE_9000" }],
    ["the same fingerprint from another connector", fauxpayInsufficientFundsFingerprint({ connector: "some_real_processor" })],
    ["different Fauxpay prose", fauxpayInsufficientFundsFingerprint({ error_details: { unified_details: { category: "UE_9000" }, connector_details: { code: "DC_08", message: "Payment declined: Another internal server error" } } })],
    ["DC_08 alone", { error_code: "DC_08" }],
    ["UE_9000 alone", { unified_code: "UE_9000" }],
    ["arbitrary prose mentioning funds", { error_message: "The funds service returned an internal error" }],
  ])("does not apply the Fauxpay adapter to %s", (_scenario, providerResponse) => {
    expect(normalizePaymentFailure({ status: "failed", ...providerResponse })).toBe("unknown");
  });

  it("uses the latest timestamped attempt as authoritative", () => {
    expect(normalizePaymentFailure({
      status: "failed",
      error_code: "insufficient_funds",
      attempts: [
        { attempt_id: "first", modified_at: "2026-08-17T10:00:00Z", error_code: "lost_card" },
        { attempt_id: "second", modified_at: "2026-08-17T10:01:00Z", error_details: { connector_details: { code: "invalid_cvv" } } },
      ],
    })).toBe("invalid_cvv");
  });

  it("lets the authoritative latest attempt override stale top-level compatibility fields", () => {
    expect(normalizePaymentFailure({
      status: "failed",
      error_code: "insufficient_funds",
      attempts: [
        { attempt_id: "older", modified_at: "2026-08-17T10:00:00Z", error_code: "invalid_cvv" },
        { attempt_id: "latest", modified_at: "2026-08-17T10:02:00Z", error_details: { connector_details: { reason: "lost card" } } },
      ],
    })).toBe("lost_card");
  });

  it("lets a latest lost-card attempt override the stale Fauxpay compatibility fingerprint", () => {
    expect(normalizePaymentFailure(fauxpayInsufficientFundsFingerprint({
      attempts: [{
        attempt_id: "latest",
        status: "failure",
        created_at: "2026-08-17T10:02:00Z",
        error_details: { connector_details: { message: "Payment declined: Lost card" } },
      }],
    }))).toBe("lost_card");
  });

  it("uses the observed connector message on the latest attempt instead of stale top-level text", () => {
    expect(normalizePaymentFailure({
      status: "failed",
      error_message: "Payment declined: Card declined",
      attempts: [
        { attempt_id: "older", created_at: "2026-08-17T10:00:00Z", error_details: { connector_details: { message: "Payment declined: Stolen card" } } },
        { attempt_id: "latest", created_at: "2026-08-17T10:02:00Z", error_details: { connector_details: { message: "Payment declined: Lost card" } } },
      ],
    })).toBe("lost_card");
  });

  it("uses the last valid expanded attempt when timestamps are absent or tied", () => {
    expect(normalizePaymentFailure({
      status: "failed",
      attempts: [
        { attempt_id: "first", error_code: "invalid_cvv" },
        null,
        { attempt_id: "last", error_details: { connector_details: { message: "stolen card" } } },
      ],
    })).toBe("stolen_card");
  });

  it.each([
    [{ error_details: { unified_details: { standardised_code: "INSUFFICIENT_FUNDS" } } }, "insufficient_funds"],
    [{ error_details: { connector_details: { code: "do_not_honor" } } }, "card_declined"],
    [{ error_details: { issuer_details: { code: "stolen_card" } } }, "stolen_card"],
  ])("normalizes documented fields on the authoritative attempt", (attempt, expected) => {
    expect(normalizePaymentFailure({ status: "failed", attempts: [{ attempt_id: "latest", ...attempt }] })).toBe(expected);
  });

  it("falls back safely for malformed attempts and ambiguous sandbox codes", () => {
    expect(normalizePaymentFailure({ status: "failed", attempts: { error_code: "insufficient_funds" } })).toBe("unknown");
    expect(normalizePaymentFailure({ status: "failed", attempts: [null, "bad", []] })).toBe("unknown");
    expect(normalizePaymentFailure({ status: "failed", error_code: "DC_08", unified_code: "UE_9000" })).toBe("unknown");
    expect(normalizePaymentFailure({ status: "failed", attempts: [{ error_code: "DC_08", unified_code: "UE_9000" }] })).toBe("unknown");
  });

  it("does not infer a reason from unknown provider prose", () => {
    expect(normalizePaymentFailure({
      status: "failed",
      error_message: "The issuer marked this stolen after an internal risk review",
      error_details: { connector_details: { reason: "Try another card because funds are insufficient" } },
    })).toBe("unknown");
  });

  it("sanitizes opt-in sandbox diagnostics to an explicit field allowlist", () => {
    const diagnostic = sanitizePaymentFailureDiagnostic({
      payment_id: "pay_test",
      status: "failed",
      connector: "dummyconnector",
      error_code: "DC_08",
      error_message: "top-level private prose",
      client_secret: "secret_private",
      payment_method_id: "pm_private",
      email: "donor@example.com",
      error_details: { connector_details: { code: "DC_08", reason: "lost card" }, risk_details: { rule: "private" } },
      attempts: [{ attempt_id: "attempt-1", status: "failed", modified_at: "2026-08-17T10:00:00Z", error_details: { unified_details: { user_guidance_message: "safe diagnostic field" } }, payment_token: "private" }],
    });
    const serialized = JSON.stringify(diagnostic);

    expect(diagnostic).toMatchObject({ payment_id: "pay_test", status: "failed", connector: "dummyconnector" });
    expect(serialized).toContain("lost card");
    expect(serialized).not.toMatch(/secret_private|pm_private|donor@example|top-level private prose|payment_token|risk_details/);
  });

  it("limits the public status lookup to the normalized failure field", () => {
    expect(paymentStatusSource).toContain('from("payment_attempts").select("failure_reason")');
    expect(paymentStatusSource).not.toMatch(/error_code|error_message|payment_method_id|client_secret|error_details|payment_events/);
    expect(paymentStatusSource).toContain('failure_reason === "unknown"');
    expect(paymentStatusSource).toContain('failure_enrichment_attempted_at');
    expect(paymentStatusSource).toContain("retrievePayment(donation.hyperswitch_payment_id, true)");
  });

  it("extends the deployed database constraint and adds one-time enrichment state in a new migration", () => {
    expect(failureMigrationSource).toContain("'lost_card'");
    expect(failureMigrationSource).toContain("'stolen_card'");
    expect(failureMigrationSource).toContain("failure_enrichment_attempted_at timestamptz");
  });
});
