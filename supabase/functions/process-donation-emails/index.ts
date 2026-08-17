import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/database.ts";
import {
  buildDonationConfirmationEmail,
  EmailConfigurationError,
  failedDeliveryUpdate,
  safeDeliveryError,
  sendDonationConfirmation,
} from "../_shared/donationEmail.ts";

type ClaimedDelivery = {
  id: string;
  donation_id: string;
  attempt_count: number;
};

function arrayRecord<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function campaignUrl(appUrl: string, slug: string) {
  const url = new URL(appUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new EmailConfigurationError("app_url_invalid");
  url.pathname = `/campaigns/${encodeURIComponent(slug)}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) {
    return json(request, { error: "Unauthorized" }, 401);
  }

  const admin = adminClient();
  const { data: claimed, error: claimError } = await admin.rpc("claim_donation_email_deliveries", { batch_size: 25 });
  if (claimError) {
    console.error("Donation email claim failed", claimError.code ?? "database_error");
    return json(request, { error: "Email processing unavailable." }, 500);
  }

  let sent = 0;
  let failed = 0;
  for (const delivery of (claimed ?? []) as ClaimedDelivery[]) {
    try {
      const { data: donation, error: donationError } = await admin
        .from("donations")
        .select("id, amount_cents, currency, frequency, is_anonymous, status, completed_at, donor:donors(name, email), campaign:campaigns(title, slug), recurring:recurring_donations(status, next_charge_at)")
        .eq("id", delivery.donation_id)
        .single();
      if (donationError || !donation || donation.status !== "succeeded" || !donation.completed_at) {
        throw new Error("confirmed_donation_unavailable");
      }
      const donor = arrayRecord(donation.donor);
      const campaign = arrayRecord(donation.campaign);
      const recurring = arrayRecord(donation.recurring);
      if (!donor?.email || !donor.name || !campaign?.title || !campaign.slug) throw new Error("email_business_data_incomplete");
      if (donation.frequency === "monthly" && recurring?.status !== "active") {
        throw new Error("monthly_plan_not_reconciled");
      }

      const appUrl = Deno.env.get("APP_URL");
      const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
      const emailFrom = Deno.env.get("MISSIONPAY_EMAIL_FROM") ?? "";
      if (!appUrl) throw new EmailConfigurationError("app_url_missing");
      const message = buildDonationConfirmationEmail({
        donationId: donation.id,
        donorName: donor.name,
        campaignTitle: campaign.title,
        campaignUrl: campaignUrl(appUrl, campaign.slug),
        amountCents: donation.amount_cents,
        currency: donation.currency,
        frequency: donation.frequency,
        isAnonymous: donation.is_anonymous,
        completedAt: donation.completed_at,
        recurringStatus: recurring?.status,
        nextChargeAt: recurring?.next_charge_at,
        sandbox: (Deno.env.get("HYPERSWITCH_BASE_URL") ?? "").includes("sandbox"),
      });
      const result = await sendDonationConfirmation({
        apiKey: resendApiKey,
        from: emailFrom,
        replyTo: Deno.env.get("MISSIONPAY_EMAIL_REPLY_TO") || undefined,
      }, {
        to: donor.email,
        message,
        idempotencyKey: `missionpay-donation-confirmation:${donation.id}`,
      });
      const { error: updateError } = await admin.from("donation_email_deliveries").update({
        status: "sent",
        provider_message_id: result.providerMessageId,
        sent_at: new Date().toISOString(),
        last_error: null,
      }).eq("id", delivery.id).eq("status", "sending");
      if (updateError) throw updateError;
      sent += 1;
      console.info("Donation email sent", { donation_id: donation.id, email_delivery_id: delivery.id, attempt_count: delivery.attempt_count });
    } catch (error) {
      failed += 1;
      await admin.from("donation_email_deliveries").update(
        failedDeliveryUpdate(delivery.attempt_count, error),
      ).eq("id", delivery.id).eq("status", "sending");
      console.error("Donation email delivery failed", { donation_id: delivery.donation_id, email_delivery_id: delivery.id, attempt_count: delivery.attempt_count, error: safeDeliveryError(error) });
    }
  }

  return json(request, { processed: (claimed ?? []).length, sent, failed });
});
