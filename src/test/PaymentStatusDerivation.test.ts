import { describe, expect, it } from "vitest";
import { buildPaymentAttemptUpdate, deriveMissionPayStatus } from "../../supabase/functions/_shared/paymentFailure";

function declinedRequiresPaymentMethod(message: string) {
  return {
    payment_id: "pay_test",
    status: "requires_payment_method",
    attempts: [{
      attempt_id: "attempt-latest",
      status: "failure",
      error_code: "DC_08",
      unified_code: "UE_9000",
      error_details: { connector_details: { code: "DC_08", message } },
    }],
  };
}

describe("Hyperswitch payment status derivation", () => {
  it("treats a declined requires_payment_method confirmation as failed and persists safe evidence", () => {
    const providerPayment = declinedRequiresPaymentMethod("Payment declined: Card declined");
    const status = deriveMissionPayStatus(providerPayment);

    expect(status).toBe("failed");
    expect(buildPaymentAttemptUpdate(providerPayment, status)).toMatchObject({
      status: "requires_payment_method",
      error_code: "DC_08",
      failure_reason: "card_declined",
      provider_failure_snapshot: {
        status: "requires_payment_method",
        authoritative_attempt: {
          attempt_id: "attempt-latest",
          status: "failure",
          error_details: { connector_details: { message: "Payment declined: Card declined" } },
        },
      },
    });
  });

  it("keeps an initial requires_payment_method payment processing without failure evidence", () => {
    const providerPayment = { status: "requires_payment_method" };
    const status = deriveMissionPayStatus(providerPayment);

    expect(status).toBe("processing");
    expect(buildPaymentAttemptUpdate(providerPayment, status)).toEqual({
      status: "requires_payment_method",
      error_code: null,
      error_message: null,
      failure_reason: null,
      provider_failure_snapshot: null,
    });
  });

  it("fails safely with an unknown reason when the authoritative attempt is terminal", () => {
    const providerPayment = { status: "requires_payment_method", attempts: [{ attempt_id: "attempt-latest", status: "failure" }] };
    const status = deriveMissionPayStatus(providerPayment);

    expect(status).toBe("failed");
    expect(buildPaymentAttemptUpdate(providerPayment, status)).toMatchObject({
      failure_reason: "unknown",
      provider_failure_snapshot: { authoritative_attempt: { status: "failure" } },
    });
  });

  it.each([
    ["Payment declined: Lost card", "lost_card"],
    ["Payment declined: Insufficient funds", "insufficient_funds"],
    ["Payment declined: Stolen card", "stolen_card"],
  ])("preserves the Fauxpay decline classification for %s", (message, reason) => {
    const providerPayment = declinedRequiresPaymentMethod(message);
    const status = deriveMissionPayStatus(providerPayment);

    expect(status).toBe("failed");
    expect(buildPaymentAttemptUpdate(providerPayment, status).failure_reason).toBe(reason);
  });

  it.each(["succeeded", "captured", "partially_captured"])("keeps %s successful", (status) => {
    expect(deriveMissionPayStatus({ status })).toBe("succeeded");
  });

  it.each(["failed", "authentication_failed", "router_declined"])("keeps terminal %s state failed", (status) => {
    expect(deriveMissionPayStatus({ status })).toBe("failed");
  });

  it.each(["cancelled", "voided"])("keeps terminal %s state cancelled", (status) => {
    expect(deriveMissionPayStatus({ status })).toBe("cancelled");
  });

  it.each(["processing", "requires_customer_action", "requires_confirmation"])("keeps genuine %s state processing", (status) => {
    expect(deriveMissionPayStatus({ status })).toBe("processing");
  });

  it("uses documented last-failed-attempt mirrors when expanded attempts are absent", () => {
    expect(deriveMissionPayStatus({
      status: "requires_payment_method",
      error_code: "DC_08",
      error_details: { connector_details: { code: "DC_08" } },
    })).toBe("failed");
  });

  it("recognizes Hyperswitch's structured manual-retry failure indicator", () => {
    const providerPayment = { status: "requires_payment_method", manual_retry_allowed: true };
    const status = deriveMissionPayStatus(providerPayment);

    expect(status).toBe("failed");
    expect(buildPaymentAttemptUpdate(providerPayment, status)).toMatchObject({
      failure_reason: "unknown",
      provider_failure_snapshot: { manual_retry_allowed: true },
    });
  });
});
