import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { sha256 } from "../_shared/crypto.ts";
import { adminClient } from "../_shared/database.ts";
import { claimFailureEnrichment, completeFailureEnrichment, releaseFailureEnrichment } from "../_shared/failureEnrichment.ts";
import { retrievePayment } from "../_shared/hyperswitch.ts";
import { isPaymentFailureReason } from "../_shared/paymentFailure.ts";
import { createRefundCapability } from "../_shared/refundCapability.ts";
import { reconcilePayment } from "../_shared/reconcile.ts";
import { hasRecurringChargeCredentials } from "../_shared/recurring.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  try {
    const body = await request.json();
    const donationId = String(body.donation_id ?? "");
    const token = String(body.status_token ?? "");
    if (!donationId || token.length < 30) return json(request, { error: "Invalid confirmation credentials." }, 401);
    const admin = adminClient();
    const { data: donation } = await admin.from("donations").select("id, amount_cents, currency, frequency, is_anonymous, status, hyperswitch_payment_id, recurring_donation_id, created_at, completed_at, access_token_hash, campaign:campaigns(title, slug), recurring:recurring_donations(status, next_charge_at, hyperswitch_customer_id, hyperswitch_payment_method_reference)").eq("id", donationId).single();
    if (!donation || donation.access_token_hash !== await sha256(token)) return json(request, { error: "Invalid confirmation credentials." }, 401);
    const initialRecurring = Array.isArray(donation.recurring) ? donation.recurring[0] : donation.recurring;
    const recurringSetupNeedsSync = donation.status === "succeeded"
      && donation.frequency === "monthly"
      && Boolean(initialRecurring)
      && (initialRecurring?.status === "pending"
        || (initialRecurring?.status === "active" && !hasRecurringChargeCredentials(initialRecurring)));
    let shouldSync = ["pending", "processing"].includes(donation.status) || recurringSetupNeedsSync;
    let enrichmentClaim: { attemptId: string; claimedAt: string } | null = null;
    if (["failed", "cancelled"].includes(donation.status) && donation.hyperswitch_payment_id) {
      const { data: latestAttempt, error: latestAttemptError } = await admin.from("payment_attempts")
        .select("id, failure_reason, failure_enrichment_attempted_at, failure_enrichment_claimed_at")
        .eq("donation_id", donationId)
        .order("attempt_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestAttemptError) throw latestAttemptError;
      if (latestAttempt && (!latestAttempt.failure_reason || latestAttempt.failure_reason === "unknown") && !latestAttempt.failure_enrichment_attempted_at) {
        const claimedAt = await claimFailureEnrichment(admin, latestAttempt.id);
        if (claimedAt) enrichmentClaim = { attemptId: latestAttempt.id, claimedAt };
        shouldSync = Boolean(claimedAt);
      }
    }
    if (shouldSync && donation.hyperswitch_payment_id) {
      try {
        const providerPayment = await retrievePayment(donation.hyperswitch_payment_id, true);
        await reconcilePayment(admin, providerPayment);
        if (enrichmentClaim) await completeFailureEnrichment(admin, enrichmentClaim.attemptId, enrichmentClaim.claimedAt);
      } catch (error) {
        if (enrichmentClaim) {
          try {
            await releaseFailureEnrichment(admin, enrichmentClaim.attemptId, enrichmentClaim.claimedAt);
          } catch {
            console.error("Payment enrichment claim release deferred");
          }
        }
        console.error("Payment sync deferred", error instanceof Error ? error.message : "unknown error");
      }
    }
    const { data: current } = await admin.from("donations").select("id, campaign_id, amount_cents, currency, frequency, is_anonymous, status, hyperswitch_payment_id, recurring_donation_id, created_at, completed_at, campaign:campaigns(title, slug), recurring:recurring_donations(status, next_charge_at, hyperswitch_customer_id, hyperswitch_payment_method_reference)").eq("id", donationId).single();
    let failure: { reason: string } | undefined;
    if (current && ["failed", "cancelled"].includes(current.status)) {
      const { data: attempt, error: attemptError } = await admin.from("payment_attempts").select("failure_reason").eq("donation_id", donationId).order("attempt_number", { ascending: false }).limit(1).maybeSingle();
      if (attemptError) throw attemptError;
      failure = { reason: isPaymentFailureReason(attempt?.failure_reason) ? attempt.failure_reason : "unknown" };
    }
    const campaign = Array.isArray(current?.campaign) ? current?.campaign[0] : current?.campaign;
    const recurring = Array.isArray(current?.recurring) ? current?.recurring[0] : current?.recurring;
    const recurringPaymentMethodReady = Boolean(recurring && hasRecurringChargeCredentials(recurring));
    const recurringChargeable = recurring?.status === "active" && recurringPaymentMethodReady;
    const { data: refundRequest } = current ? await admin.from("refund_requests").select("status").eq("donation_id", donationId).maybeSingle() : { data: null };
    const { data: refund } = current ? await admin.from("refunds").select("status").eq("donation_id", donationId).maybeSingle() : { data: null };
    let refundUrl: string | undefined;
    if (current?.hyperswitch_payment_id && ["succeeded", "refunded"].includes(current.status)) {
      const capability = await createRefundCapability(current.id, Deno.env.get("DONATION_MANAGEMENT_LINK_SECRET") ?? "");
      const url = new URL(Deno.env.get("APP_URL") ?? "http://localhost:5173");
      url.pathname = `/refund-request/${encodeURIComponent(capability)}`;
      url.search = "";
      url.hash = "";
      refundUrl = url.toString();
    }
    return json(request, {
      id: current?.id,
      campaign_id: current?.campaign_id,
      amount_cents: current?.amount_cents,
      currency: current?.currency,
      frequency: current?.frequency,
      is_anonymous: current?.is_anonymous,
      status: current?.status,
      hyperswitch_payment_id: current?.hyperswitch_payment_id,
      recurring_donation_id: current?.recurring_donation_id,
      created_at: current?.created_at,
      completed_at: current?.completed_at,
      campaign,
      recurring_status: recurring?.status,
      recurring_payment_method_ready: recurringPaymentMethodReady,
      next_charge_at: recurringChargeable ? recurring?.next_charge_at : undefined,
      refund_url: refundUrl,
      refund_request_status: refundRequest?.status,
      refund_status: refund?.status,
      failure,
    });
  } catch (error) {
    console.error("payment-status failed", error instanceof Error ? error.message : "unknown error");
    return json(request, { error: "Payment status is temporarily unavailable." }, 500);
  }
});
