import { describe, expect, it, vi } from "vitest";
import { hasRecurringChargeCredentials, initialRecurringSetupUpdate, resolvePaymentMethodId } from "../../supabase/functions/_shared/recurring";

const nextChargeAt = "2026-09-17T08:00:00.000Z";

describe("monthly recurring activation", () => {
  it("activates and persists a payment method returned by the successful CIT", async () => {
    const retrieve = vi.fn();
    const methodId = await resolvePaymentMethodId({ payment_method_id: " pm_test_123 " }, "pay_123", retrieve);
    expect(methodId).toBe("pm_test_123");
    expect(retrieve).not.toHaveBeenCalled();
    expect(initialRecurringSetupUpdate("cus_123", methodId, nextChargeAt)).toEqual({
      status: "active",
      hyperswitch_payment_method_reference: "pm_test_123",
      next_charge_at: nextChargeAt,
    });
  });

  it("uses the authoritative force-sync retrieval when the initial response omits the method", async () => {
    const retrieve = vi.fn().mockResolvedValue({ status: "succeeded", payment_method_id: "pm_test_123" });
    const methodId = await resolvePaymentMethodId({ status: "succeeded" }, "pay_123", retrieve);
    expect(retrieve).toHaveBeenCalledWith("pay_123", true);
    expect(initialRecurringSetupUpdate("cus_123", methodId, nextChargeAt).status).toBe("active");
  });

  it("keeps the successful donation but makes recurring setup non-active when retrieval still has no method", async () => {
    const retrieve = vi.fn().mockResolvedValue({ status: "succeeded" });
    const methodId = await resolvePaymentMethodId({ status: "succeeded" }, "pay_123", retrieve);
    const update = initialRecurringSetupUpdate("cus_123", methodId, nextChargeAt);
    expect(methodId).toBeNull();
    expect(update).toEqual({ status: "past_due", hyperswitch_payment_method_reference: null });
    expect(hasRecurringChargeCredentials({ hyperswitch_customer_id: "cus_123", hyperswitch_payment_method_reference: null })).toBe(false);
  });

  it("requires both non-empty customer and payment-method references", () => {
    expect(hasRecurringChargeCredentials({ hyperswitch_customer_id: "cus_123", hyperswitch_payment_method_reference: "pm_123" })).toBe(true);
    expect(hasRecurringChargeCredentials({ hyperswitch_customer_id: "", hyperswitch_payment_method_reference: "pm_123" })).toBe(false);
    expect(hasRecurringChargeCredentials({ hyperswitch_customer_id: "cus_123", hyperswitch_payment_method_reference: "  " })).toBe(false);
  });
});
