import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { randomToken, sha256 } from "../_shared/crypto.ts";
import { adminClient } from "../_shared/database.ts";
import { createCustomer, createPayment, nextMonthlyDate } from "../_shared/hyperswitch.ts";

interface RequestBody {
  campaign_id?: string;
  amount_cents?: number;
  frequency?: "one_time" | "monthly";
  donor_name?: string;
  donor_email?: string;
  is_anonymous?: boolean;
  recurring_consent?: boolean;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 12_000) return json(request, { error: "Request is too large." }, 413);
    const body = await request.json() as RequestBody;
    const amount = Number(body.amount_cents);
    const name = String(body.donor_name ?? "").trim();
    const email = String(body.donor_email ?? "").trim().toLowerCase();
    if (!body.campaign_id || !Number.isInteger(amount) || amount < 100 || amount > 1_000_000) return json(request, { error: "Donation amount must be between $1 and $10,000." }, 400);
    if (!body.frequency || !["one_time", "monthly"].includes(body.frequency)) return json(request, { error: "Choose one-time or monthly giving." }, 400);
    if (name.length < 2 || name.length > 255 || !/^\S+@\S+\.\S+$/.test(email) || email.length > 255) return json(request, { error: "Enter a valid name and email address." }, 400);
    if (body.frequency === "monthly" && body.recurring_consent !== true) return json(request, { error: "Monthly donation authorization is required." }, 400);

    const admin = adminClient();
    const { data: campaign, error: campaignError } = await admin.from("campaigns").select("id, title, status, currency").eq("id", body.campaign_id).maybeSingle();
    if (campaignError) {
      console.error("Campaign lookup failed", { code: campaignError.code, message: campaignError.message });
      return json(request, { error: "We could not verify this campaign right now. No charge was made. Please try again." }, 500);
    }
    if (!campaign || campaign.status !== "published") return json(request, { error: "This campaign is not open for donations." }, 409);
    if (campaign.currency !== "USD") return json(request, { error: "MissionPay currently supports USD campaigns only." }, 409);

    const { data: donor, error: donorError } = await admin.from("donors").upsert({ name, email }, { onConflict: "email" }).select("id").single();
    if (donorError || !donor) throw new Error("Could not create donor record");
    const statusToken = randomToken();
    const managementToken = body.frequency === "monthly" ? randomToken() : undefined;
    let recurringId: string | null = null;
    const customerId = `cus_mp_${donor.id.replaceAll("-", "")}`;
    if (body.frequency === "monthly") {
      await createCustomer({ customerId, name, email });
      const now = new Date();
      const { data: recurring, error: recurringError } = await admin.from("recurring_donations").insert({
        campaign_id: campaign.id,
        donor_id: donor.id,
        amount_cents: amount,
        currency: "USD",
        is_anonymous: Boolean(body.is_anonymous),
        status: "pending",
        hyperswitch_customer_id: customerId,
        started_at: now.toISOString(),
        next_charge_at: nextMonthlyDate(now, now.getUTCDate()).toISOString(),
        billing_anchor_day: now.getUTCDate(),
        consent_captured_at: now.toISOString(),
        management_token_hash: await sha256(managementToken!),
      }).select("id").single();
      if (recurringError || !recurring) throw new Error("Could not create recurring donation record");
      recurringId = recurring.id;
    }
    const { data: donation, error: donationError } = await admin.from("donations").insert({
      campaign_id: campaign.id,
      donor_id: donor.id,
      recurring_donation_id: recurringId,
      amount_cents: amount,
      currency: "USD",
      frequency: body.frequency,
      is_anonymous: Boolean(body.is_anonymous),
      status: "pending",
      access_token_hash: await sha256(statusToken),
      billing_period_start: body.frequency === "monthly" ? new Date().toISOString().slice(0, 10) : null,
    }).select("id").single();
    if (donationError || !donation) throw new Error("Could not create donation record");

    try {
      const payment = await createPayment({
        amount,
        currency: "USD",
        confirm: false,
        capture_method: "automatic",
        customer_id: body.frequency === "monthly" ? customerId : undefined,
        email,
        name,
        profile_id: Deno.env.get("HYPERSWITCH_PROFILE_ID"),
        description: `Donation to ${campaign.title}`,
        return_url: `${Deno.env.get("APP_URL") ?? "http://localhost:5173"}/donation/${donation.id}/success`,
        setup_future_usage: body.frequency === "monthly" ? "off_session" : undefined,
        metadata: { missionpay_donation_id: donation.id, missionpay_campaign_id: campaign.id, frequency: body.frequency },
      });
      await admin.from("donations").update({ hyperswitch_payment_id: payment.payment_id, status: "processing" }).eq("id", donation.id);
      await admin.from("payment_attempts").insert({ donation_id: donation.id, hyperswitch_payment_id: payment.payment_id, attempt_number: 1, status: payment.status ?? "requires_payment_method" });
      return json(request, { donation_id: donation.id, payment_id: payment.payment_id, client_secret: payment.client_secret, status_token: statusToken, recurring_management_token: managementToken });
    } catch (paymentError) {
      await admin.from("donations").update({ status: "failed" }).eq("id", donation.id);
      if (recurringId) await admin.from("recurring_donations").update({ status: "past_due" }).eq("id", recurringId);
      console.error("Hyperswitch create payment failed", paymentError instanceof Error ? paymentError.message : "unknown error");
      return json(request, { error: "Secure checkout could not be started. No charge was made." }, 502);
    }
  } catch (error) {
    console.error("create-payment failed", error instanceof Error ? error.message : "unknown error");
    return json(request, { error: "We could not prepare this donation. No charge was made." }, 500);
  }
});
