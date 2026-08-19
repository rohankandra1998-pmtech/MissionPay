import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/database.ts";
import { createManagementCapability } from "../_shared/managementCapability.ts";
import { createRefundCapability } from "../_shared/refundCapability.ts";
import { hasRecurringChargeCredentials } from "../_shared/recurring.ts";
import {
  buildDonationConfirmationEmail,
  buildRecurringCancellationEmail,
  buildRefundApprovedEmail,
  buildRefundCompletedEmail,
  buildRefundDeclinedEmail,
  buildRefundRequestedEmail,
  EmailConfigurationError,
  failedDeliveryUpdate,
  safeDeliveryError,
  sendTransactionalEmail,
  type TransactionalEmailMessage,
} from "../_shared/donationEmail.ts";

type NotificationType =
  | "donation_confirmation"
  | "refund_requested"
  | "refund_approved"
  | "refund_declined"
  | "refund_completed"
  | "recurring_cancelled";

type ClaimedDelivery = {
  id: string;
  donation_id: string | null;
  recurring_donation_id: string | null;
  notification_type: NotificationType;
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

function managementUrl(appUrl: string, token: string) {
  const url = new URL(appUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new EmailConfigurationError("app_url_invalid");
  url.pathname = `/manage-donation/${encodeURIComponent(token)}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function refundUrl(appUrl: string, token: string) {
  const url = new URL(appUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new EmailConfigurationError("app_url_invalid");
  url.pathname = `/refund-request/${encodeURIComponent(token)}`;
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
      const appUrl = Deno.env.get("APP_URL");
      if (!appUrl) throw new EmailConfigurationError("app_url_missing");
      const sandbox = (Deno.env.get("HYPERSWITCH_BASE_URL") ?? "").includes("sandbox");
      let recipient: { email: string; name: string };
      let message: TransactionalEmailMessage;

      if (delivery.notification_type === "recurring_cancelled") {
        if (!delivery.recurring_donation_id || delivery.donation_id) throw new Error("email_delivery_scope_invalid");
        const { data: recurring, error: recurringError } = await admin
          .from("recurring_donations")
          .select("id, amount_cents, currency, status, cancelled_at, donor:donors(name, email), campaign:campaigns(title, slug)")
          .eq("id", delivery.recurring_donation_id)
          .single();
        const donor = arrayRecord(recurring?.donor ?? null);
        const campaign = arrayRecord(recurring?.campaign ?? null);
        if (recurringError || !recurring || recurring.status !== "cancelled" || !recurring.cancelled_at) {
          throw new Error("cancelled_recurring_plan_unavailable");
        }
        if (!donor?.email || !donor.name || !campaign?.title || !campaign.slug) throw new Error("email_business_data_incomplete");
        recipient = donor;
        message = buildRecurringCancellationEmail({
          donorName: donor.name,
          campaignTitle: campaign.title,
          campaignUrl: campaignUrl(appUrl, campaign.slug),
          amountCents: recurring.amount_cents,
          currency: recurring.currency,
          cancelledAt: recurring.cancelled_at,
          sandbox,
        });
      } else {
        if (!delivery.donation_id || delivery.recurring_donation_id) throw new Error("email_delivery_scope_invalid");
        const { data: donation, error: donationError } = await admin
          .from("donations")
          .select("id, amount_cents, currency, frequency, is_anonymous, status, completed_at, donor:donors(name, email), campaign:campaigns(title, slug), recurring:recurring_donations(id, status, next_charge_at, hyperswitch_customer_id, hyperswitch_payment_method_reference), refund_request:refund_requests(status, decision_note, created_at, reviewed_at), refund:refunds(status, amount_cents, currency, completed_at)")
          .eq("id", delivery.donation_id)
          .single();
        if (donationError || !donation) throw new Error("donation_email_data_unavailable");
        const donor = arrayRecord(donation.donor);
        const campaign = arrayRecord(donation.campaign);
        const recurring = arrayRecord(donation.recurring);
        const refundRequest = arrayRecord(donation.refund_request);
        const refund = arrayRecord(donation.refund);
        if (!donor?.email || !donor.name || !campaign?.title || !campaign.slug) throw new Error("email_business_data_incomplete");
        recipient = donor;

        if (delivery.notification_type === "donation_confirmation") {
          if (donation.status !== "succeeded" || !donation.completed_at) throw new Error("confirmed_donation_unavailable");
          if (donation.frequency === "monthly" && (!recurring || recurring.status === "pending")) {
            throw new Error("monthly_plan_not_reconciled");
          }
          const linkSecret = Deno.env.get("DONATION_MANAGEMENT_LINK_SECRET") ?? "";
          let recurringManagementUrl: string | undefined;
          if (donation.frequency === "monthly" && recurring) {
            try {
              recurringManagementUrl = managementUrl(appUrl, await createManagementCapability(recurring.id, linkSecret));
            } catch {
              throw new EmailConfigurationError("donation_management_link_secret_invalid");
            }
          }
          message = buildDonationConfirmationEmail({
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
            recurringPaymentMethodReady: Boolean(recurring && hasRecurringChargeCredentials(recurring)),
            nextChargeAt: recurring?.next_charge_at,
            managementUrl: recurringManagementUrl,
            refundUrl: refundUrl(appUrl, await createRefundCapability(donation.id, linkSecret)),
            sandbox,
          });
        } else {
          const common = {
            donationId: donation.id,
            donorName: donor.name,
            campaignTitle: campaign.title,
            campaignUrl: campaignUrl(appUrl, campaign.slug),
            amountCents: donation.amount_cents,
            currency: donation.currency,
            frequency: donation.frequency,
            sandbox,
          };
          if (delivery.notification_type === "refund_requested") {
            if (!refundRequest?.created_at) throw new Error("refund_request_unavailable");
            message = buildRefundRequestedEmail({ ...common, eventAt: refundRequest.created_at });
          } else if (delivery.notification_type === "refund_approved") {
            if (refundRequest?.status !== "approved" || !refundRequest.reviewed_at) throw new Error("approved_refund_request_unavailable");
            message = buildRefundApprovedEmail({ ...common, eventAt: refundRequest.reviewed_at, decisionNote: refundRequest.decision_note });
          } else if (delivery.notification_type === "refund_declined") {
            if (refundRequest?.status !== "declined" || !refundRequest.reviewed_at) throw new Error("declined_refund_request_unavailable");
            message = buildRefundDeclinedEmail({ ...common, eventAt: refundRequest.reviewed_at, decisionNote: refundRequest.decision_note });
          } else if (delivery.notification_type === "refund_completed") {
            if (refund?.status !== "succeeded" || !refund.completed_at) throw new Error("completed_refund_unavailable");
            message = buildRefundCompletedEmail({
              ...common,
              amountCents: refund.amount_cents,
              currency: refund.currency,
              eventAt: refund.completed_at,
            });
          } else {
            throw new Error("email_notification_type_unsupported");
          }
        }
      }

      const result = await sendTransactionalEmail({
        apiKey: Deno.env.get("BREVO_API_KEY") ?? "",
        senderName: Deno.env.get("MISSIONPAY_EMAIL_FROM_NAME") ?? "",
        senderAddress: Deno.env.get("MISSIONPAY_EMAIL_FROM_ADDRESS") ?? "",
        replyTo: Deno.env.get("MISSIONPAY_EMAIL_REPLY_TO") || undefined,
      }, {
        to: recipient.email,
        toName: recipient.name,
        message,
        idempotencyKey: delivery.id,
      });
      const { error: updateError } = await admin.from("donation_email_deliveries").update({
        status: "sent",
        provider_message_id: result.providerMessageId,
        sent_at: new Date().toISOString(),
        last_error: null,
      }).eq("id", delivery.id).eq("status", "sending");
      if (updateError) throw updateError;
      sent += 1;
      console.info("Donation email sent", {
        email_delivery_id: delivery.id,
        notification_type: delivery.notification_type,
        attempt_count: delivery.attempt_count,
      });
    } catch (error) {
      failed += 1;
      await admin.from("donation_email_deliveries").update(
        failedDeliveryUpdate(delivery.attempt_count, error),
      ).eq("id", delivery.id).eq("status", "sending");
      console.error("Donation email delivery failed", {
        email_delivery_id: delivery.id,
        notification_type: delivery.notification_type,
        attempt_count: delivery.attempt_count,
        error: safeDeliveryError(error),
      });
    }
  }

  return json(request, { processed: (claimed ?? []).length, sent, failed });
});
