import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.3";
import { nextMonthlyDate, retrievePayment } from "./hyperswitch.ts";
import { buildPaymentAttemptUpdate, deriveMissionPayStatus } from "./paymentFailure.ts";

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
    let methodId = providerPayment.payment_method_id as string | undefined;
    if (!methodId) {
      const retrieved = await retrievePayment(paymentId, true);
      methodId = retrieved.payment_method_id;
    }
    const { data: recurring } = await admin.from("recurring_donations").select("billing_anchor_day, next_charge_at").eq("id", donation.recurring_donation_id).single();
    if (recurring) {
      const next = nextMonthlyDate(new Date(), recurring.billing_anchor_day);
      await admin.from("recurring_donations").update({ status: "active", hyperswitch_payment_method_reference: methodId ?? null, next_charge_at: next.toISOString() }).eq("id", donation.recurring_donation_id).eq("status", "pending");
    }
  } else if (donation?.recurring_donation_id && status === "failed") {
    await admin.from("recurring_donations").update({ status: "past_due" }).eq("id", donation.recurring_donation_id).eq("status", "active");
  }
  return { ...donation, status };
}
