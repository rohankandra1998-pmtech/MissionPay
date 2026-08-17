import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { sha256 } from "../_shared/crypto.ts";
import { adminClient } from "../_shared/database.ts";
import { retrievePayment } from "../_shared/hyperswitch.ts";
import { isPaymentFailureReason } from "../_shared/paymentFailure.ts";
import { reconcilePayment } from "../_shared/reconcile.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  try {
    const body = await request.json();
    const donationId = String(body.donation_id ?? "");
    const token = String(body.status_token ?? "");
    if (!donationId || token.length < 30) return json(request, { error: "Invalid confirmation credentials." }, 401);
    const admin = adminClient();
    const { data: donation } = await admin.from("donations").select("id, amount_cents, currency, frequency, is_anonymous, status, hyperswitch_payment_id, recurring_donation_id, created_at, completed_at, access_token_hash, campaign:campaigns(title, slug), recurring:recurring_donations(status, next_charge_at)").eq("id", donationId).single();
    if (!donation || donation.access_token_hash !== await sha256(token)) return json(request, { error: "Invalid confirmation credentials." }, 401);
    let shouldSync = ["pending", "processing"].includes(donation.status);
    if (["failed", "cancelled"].includes(donation.status) && donation.hyperswitch_payment_id) {
      const { data: latestAttempt, error: latestAttemptError } = await admin.from("payment_attempts")
        .select("id, failure_reason, failure_enrichment_attempted_at")
        .eq("donation_id", donationId)
        .order("attempt_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestAttemptError) throw latestAttemptError;
      if (latestAttempt && (!latestAttempt.failure_reason || latestAttempt.failure_reason === "unknown") && !latestAttempt.failure_enrichment_attempted_at) {
        const { data: claimedAttempt, error: claimError } = await admin.from("payment_attempts")
          .update({ failure_enrichment_attempted_at: new Date().toISOString() })
          .eq("id", latestAttempt.id)
          .is("failure_enrichment_attempted_at", null)
          .select("id")
          .maybeSingle();
        if (claimError) throw claimError;
        shouldSync = Boolean(claimedAttempt);
      }
    }
    if (shouldSync && donation.hyperswitch_payment_id) {
      try {
        const providerPayment = await retrievePayment(donation.hyperswitch_payment_id, true);
        await reconcilePayment(admin, providerPayment);
      } catch (error) {
        console.error("Payment sync deferred", error instanceof Error ? error.message : "unknown error");
      }
    }
    const { data: current } = await admin.from("donations").select("id, campaign_id, amount_cents, currency, frequency, is_anonymous, status, hyperswitch_payment_id, recurring_donation_id, created_at, completed_at, campaign:campaigns(title, slug), recurring:recurring_donations(status, next_charge_at)").eq("id", donationId).single();
    let failure: { reason: string } | undefined;
    if (current && ["failed", "cancelled"].includes(current.status)) {
      const { data: attempt, error: attemptError } = await admin.from("payment_attempts").select("failure_reason").eq("donation_id", donationId).order("attempt_number", { ascending: false }).limit(1).maybeSingle();
      if (attemptError) throw attemptError;
      failure = { reason: isPaymentFailureReason(attempt?.failure_reason) ? attempt.failure_reason : "unknown" };
    }
    const campaign = Array.isArray(current?.campaign) ? current?.campaign[0] : current?.campaign;
    const recurring = Array.isArray(current?.recurring) ? current?.recurring[0] : current?.recurring;
    return json(request, { ...current, campaign, recurring_status: recurring?.status, next_charge_at: recurring?.next_charge_at, failure, recurring: undefined });
  } catch (error) {
    console.error("payment-status failed", error instanceof Error ? error.message : "unknown error");
    return json(request, { error: "Payment status is temporarily unavailable." }, 500);
  }
});
