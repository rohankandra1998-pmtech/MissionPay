import { describe, expect, it } from "vitest";
import paymentStatusSource from "../../supabase/functions/payment-status/index.ts?raw";
import failureMigrationSource from "../../supabase/migrations/20260817222033_improve_hyperswitch_decline_reasons.sql?raw";
import { normalizePaymentFailure, sanitizePaymentFailureDiagnostic } from "../../supabase/functions/_shared/paymentFailure";

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
