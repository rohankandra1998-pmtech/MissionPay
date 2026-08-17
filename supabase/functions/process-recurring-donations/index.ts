import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { randomToken, sha256 } from "../_shared/crypto.ts";
import { adminClient, userClient } from "../_shared/database.ts";
import { createPayment, missionPayStatus, nextMonthlyDate } from "../_shared/hyperswitch.ts";

async function authorized(request: Request, recurringId?: string) {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && request.headers.get("x-cron-secret") === cronSecret) return true;
  if (Deno.env.get("ENABLE_DEV_TRIGGER") !== "true" || !recurringId) return false;
  const client = userClient(request);
  const { data: { user } } = await client.auth.getUser();
  if (!user) return false;
  const admin = adminClient();
  const { data } = await admin.from("recurring_donations").select("campaign:campaigns(fundraiser:fundraisers(user_id))").eq("id", recurringId).single();
  const campaign = Array.isArray(data?.campaign) ? data.campaign[0] : data?.campaign;
  const fundraiser = Array.isArray(campaign?.fundraiser) ? campaign.fundraiser[0] : campaign?.fundraiser;
  return fundraiser?.user_id === user.id;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  try {
    const body = await request.json().catch(() => ({}));
    const requestedId = typeof body.recurring_donation_id === "string" ? body.recurring_donation_id : undefined;
    if (!await authorized(request, requestedId)) return json(request, { error: "Unauthorized" }, 401);
    const admin = adminClient();
    let query = admin.from("recurring_donations").select("*, donor:donors(name, email), campaign:campaigns(title)").eq("status", "active").order("next_charge_at").limit(50);
    query = requestedId ? query.eq("id", requestedId) : query.lte("next_charge_at", new Date().toISOString());
    const { data: plans, error: queryError } = await query;
    if (queryError) throw queryError;
    const results: Array<Record<string, unknown>> = [];
    for (const plan of plans ?? []) {
      const periodStart = new Date(plan.next_charge_at).toISOString().slice(0, 10);
      const accessToken = randomToken();
      const { data: donation, error: donationError } = await admin.from("donations").insert({ campaign_id: plan.campaign_id, donor_id: plan.donor_id, recurring_donation_id: plan.id, amount_cents: plan.amount_cents, currency: "USD", frequency: "monthly", is_anonymous: plan.is_anonymous, status: "pending", access_token_hash: await sha256(accessToken), billing_period_start: periodStart }).select("id").single();
      if (donationError?.code === "23505") { results.push({ recurring_id: plan.id, status: "already_processed", period: periodStart }); continue; }
      if (donationError || !donation) { results.push({ recurring_id: plan.id, status: "database_error", period: periodStart }); continue; }
      try {
        const providerPayment = await createPayment({ amount: plan.amount_cents, currency: "USD", confirm: true, capture_method: "automatic", customer_id: plan.hyperswitch_customer_id, profile_id: Deno.env.get("HYPERSWITCH_PROFILE_ID"), off_session: true, recurring_details: { type: "payment_method_id", data: plan.hyperswitch_payment_method_reference }, description: `Monthly donation to ${plan.campaign?.title ?? "MissionPay campaign"}`, metadata: { missionpay_donation_id: donation.id, recurring_donation_id: plan.id, billing_period_start: periodStart } });
        const missionStatus = missionPayStatus(providerPayment.status ?? "processing");
        await admin.from("donations").update({ hyperswitch_payment_id: providerPayment.payment_id, status: missionStatus, provider_updated_at: providerPayment.updated ?? new Date().toISOString(), completed_at: missionStatus === "succeeded" ? new Date().toISOString() : null }).eq("id", donation.id);
        await admin.from("payment_attempts").insert({ donation_id: donation.id, hyperswitch_payment_id: providerPayment.payment_id, attempt_number: 1, status: providerPayment.status ?? missionStatus });
        if (missionStatus === "succeeded") await admin.from("recurring_donations").update({ status: "active", next_charge_at: nextMonthlyDate(new Date(plan.next_charge_at), plan.billing_anchor_day).toISOString() }).eq("id", plan.id);
        else if (missionStatus === "failed") await admin.from("recurring_donations").update({ status: "past_due" }).eq("id", plan.id);
        results.push({ recurring_id: plan.id, donation_id: donation.id, payment_id: providerPayment.payment_id, status: missionStatus, period: periodStart });
      } catch (paymentError) {
        await admin.from("donations").update({ status: "failed" }).eq("id", donation.id);
        await admin.from("recurring_donations").update({ status: "past_due" }).eq("id", plan.id);
        console.error("Recurring payment failed", plan.id, paymentError instanceof Error ? paymentError.message : "unknown error");
        results.push({ recurring_id: plan.id, donation_id: donation.id, status: "failed", period: periodStart });
      }
    }
    return json(request, { processed: results.length, results });
  } catch (error) {
    console.error("process-recurring-donations failed", error instanceof Error ? error.message : "unknown error");
    return json(request, { error: "Recurring processing failed." }, 500);
  }
});
