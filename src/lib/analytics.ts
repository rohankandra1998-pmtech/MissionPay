export type AnalyticsEvent =
  | "campaign_viewed"
  | "donate_clicked"
  | "donation_frequency_selected"
  | "donation_amount_selected"
  | "checkout_started"
  | "payment_submitted"
  | "payment_succeeded"
  | "payment_failed"
  | "monthly_donation_created"
  | "monthly_donation_cancelled"
  | "campaign_created"
  | "campaign_published";

export function track(event: AnalyticsEvent, properties: Record<string, string | number | boolean> = {}) {
  if (import.meta.env.DEV) console.info("[MissionPay analytics]", event, properties);
  window.dispatchEvent(new CustomEvent("missionpay:analytics", { detail: { event, properties } }));
}
