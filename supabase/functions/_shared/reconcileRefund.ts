import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.3";
import { refundReconciliationUpdate, shouldApplyRefundUpdate } from "./refunds.ts";

export async function reconcileRefund(admin: SupabaseClient, providerRefund: Record<string, unknown>) {
  const providerRefundId = String(providerRefund.refund_id ?? "");
  if (!providerRefundId) throw new Error("Refund payload has no refund_id");
  const { data: refund, error } = await admin.from("refunds")
    .select("id, donation_id, hyperswitch_payment_id, amount_cents, currency, status, provider_updated_at")
    .eq("hyperswitch_refund_id", providerRefundId)
    .maybeSingle();
  if (error) throw error;
  if (!refund) return null;

  if (String(providerRefund.payment_id ?? "") !== refund.hyperswitch_payment_id
      || Number(providerRefund.amount) !== Number(refund.amount_cents)
      || String(providerRefund.currency ?? "").toUpperCase() !== refund.currency) {
    throw new Error("Hyperswitch refund identity mismatch");
  }

  if (refund.status === "succeeded") {
    const { error: donationError } = await admin.from("donations")
      .update({ status: "refunded" })
      .eq("id", refund.donation_id)
      .eq("status", "succeeded");
    if (donationError) throw donationError;
    return refund;
  }

  const providerUpdated = typeof providerRefund.updated_at === "string" ? new Date(providerRefund.updated_at) : new Date();
  if (!shouldApplyRefundUpdate(refund.status, refund.provider_updated_at, providerUpdated)) return refund;
  const update = refundReconciliationUpdate(refund.status, providerRefund, providerUpdated);
  if (!update) return refund;

  const { error: updateError } = await admin.from("refunds").update(update).eq("id", refund.id).neq("status", "succeeded");
  if (updateError) throw updateError;
  if (update.status === "succeeded") {
    const { error: donationError } = await admin.from("donations")
      .update({ status: "refunded" })
      .eq("id", refund.donation_id)
      .eq("status", "succeeded");
    if (donationError) throw donationError;
  }
  return { ...refund, ...update };
}
