import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.3";
import { nextMonthlyDate, retrievePayment } from "./hyperswitch.ts";
import { buildPaymentAttemptUpdate, deriveMissionPayStatus } from "./paymentFailure.ts";
import { hasRecurringChargeCredentials, initialRecurringSetupUpdate, normalizeProviderReference, resolvePaymentMethodId } from "./recurring.ts";

export async function reconcilePayment(admin: SupabaseClient, providerPayment: Record<string, unknown>) {
  const paymentId = String(providerPayment.payment_id ?? "");
  if (!paymentId) throw new Error("Payment payload has no payment_id");
  const { data: attempt } = await admin.from("payment_attempts").select("id, donation_id, donation:donations(id, recurring_donation_id, provider_updated_at)").eq("hyperswitch_payment_id", paymentId).single();
  if (!attempt) return null;
  const donation = Array.isArray(attempt.donation) ? attempt.donation[0] : attempt.donation;
  const providerUpdated = providerPayment.updated ? new Date(String(providerPayment.updated)) : new Date();
  if (donation?.provider_updated_at && new Date(donation.provider_updated_at) > providerUpdated) return donation;
  const status = deriveMissionPayStatus(providerPayment);
  await admin.from("payment_attempts").update(buildPaymentAttemptUpdate(providerPayment, status)).eq("id", attempt.id);
  await admin.from("donations").update({ status, provider_updated_at: providerUpdated.toISOString(), completed_at: status === "succeeded" ? providerUpdated.toISOString() : null }).eq("id", attempt.donation_id);
  if (donation?.recurring_donation_id && status === "succeeded") {
    const { data: recurring } = await admin.from("recurring_donations")
      .select("status, billing_anchor_day, next_charge_at, hyperswitch_customer_id, hyperswitch_payment_method_reference")
      .eq("id", donation.recurring_donation_id)
      .single();
    if (recurring?.status === "pending") {
      const methodId = await resolvePaymentMethodId(providerPayment, paymentId, retrievePayment);
      const next = nextMonthlyDate(new Date(), recurring.billing_anchor_day);
      await admin.from("recurring_donations")
        .update(initialRecurringSetupUpdate(recurring.hyperswitch_customer_id, methodId, next.toISOString()))
        .eq("id", donation.recurring_donation_id)
        .eq("status", "pending");
    } else if (recurring?.status === "active" && !hasRecurringChargeCredentials(recurring)) {
      const methodId = await resolvePaymentMethodId(providerPayment, paymentId, retrievePayment);
      const customerId = normalizeProviderReference(recurring.hyperswitch_customer_id);
      await admin.from("recurring_donations")
        .update(customerId && methodId
          ? { hyperswitch_payment_method_reference: methodId }
          : { status: "past_due", hyperswitch_payment_method_reference: methodId })
        .eq("id", donation.recurring_donation_id)
        .eq("status", "active");
    }
  } else if (donation?.recurring_donation_id && status === "failed") {
    await admin.from("recurring_donations").update({ status: "past_due" }).eq("id", donation.recurring_donation_id).eq("status", "active");
  }
  return { ...donation, status };
}
