import { describe, expect, it } from "vitest";
import paymentStatusSource from "../../supabase/functions/payment-status/index.ts?raw";
import { normalizePaymentFailure } from "../../supabase/functions/_shared/paymentFailure";

describe("payment failure normalization", () => {
  it.each([
    ["INSUFFICIENT_FUNDS", "insufficient_funds"],
    ["DO_NOT_HONOR", "card_declined"],
    ["CARD_LOST_OR_STOLEN", "card_unavailable"],
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

  it("uses only exact machine-code fallbacks and ignores unsafe provider messages", () => {
    const providerResponse = {
      status: "failed",
      error_code: "expired_card",
      error_message: "private issuer and risk detail",
      payment_method_id: "pm_private",
      client_secret: "secret_private",
    };

    expect(normalizePaymentFailure(providerResponse)).toBe("expired_card");
    expect(normalizePaymentFailure({ status: "failed", error_message: "insufficient funds" })).toBe("unknown");
  });

  it("classifies unified platform categories without exposing their detail", () => {
    expect(normalizePaymentFailure({ error_details: { unified_details: { category: "UE_3000", description: "private PSP detail" } } })).toBe("technical_error");
    expect(normalizePaymentFailure({ status: "failed", error_code: "unrecognized_code" })).toBe("unknown");
  });

  it("limits the public status lookup to the normalized failure field", () => {
    expect(paymentStatusSource).toContain('from("payment_attempts").select("failure_reason")');
    expect(paymentStatusSource).not.toMatch(/error_code|error_message|payment_method_id|client_secret|error_details|payment_events/);
  });
});
