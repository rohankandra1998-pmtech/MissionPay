export type CampaignStatus = "draft" | "published" | "closed";
export type DonationStatus = "pending" | "processing" | "succeeded" | "failed" | "cancelled" | "refunded";
export type DonationFrequency = "one_time" | "monthly";
export type RecurringStatus = "pending" | "active" | "past_due" | "cancelled";
export type PaymentFailureReason = "insufficient_funds" | "card_declined" | "lost_card" | "stolen_card" | "card_unavailable" | "authentication_failed" | "invalid_cvv" | "expired_card" | "invalid_card" | "payment_cancelled" | "session_expired" | "technical_error" | "unknown";
export type RefundRequestReason = "incorrect_amount" | "duplicate" | "unauthorized" | "other";
export type RefundRequestStatus = "pending" | "approved" | "declined";
export type RefundStatus = "initiating" | "pending" | "review" | "succeeded" | "failed";

export interface Campaign {
  id: string;
  fundraiser_id: string;
  slug: string;
  title: string;
  short_description: string;
  story: string;
  category: string;
  goal_amount_cents: number;
  currency: string;
  cover_image_url: string;
  impact_statement: string;
  status: CampaignStatus;
  end_date: string | null;
  published_at: string | null;
  created_at: string;
  fundraiser: {
    display_name: string;
    organization_name: string | null;
    avatar_url: string | null;
    verification_status: "unverified" | "pending" | "verified";
  };
  metrics: {
    raised_amount_cents: number;
    supporter_count: number;
    successful_donation_count: number;
    active_recurring_count: number;
    average_donation_cents: number;
  };
}

export interface Donation {
  id: string;
  campaign_id: string;
  amount_cents: number;
  currency: string;
  frequency: DonationFrequency;
  is_anonymous: boolean;
  status: DonationStatus;
  hyperswitch_payment_id: string | null;
  recurring_donation_id: string | null;
  created_at: string;
  completed_at: string | null;
  donor?: { name: string; email: string };
  campaign?: { title: string; slug: string };
}

export interface RecurringDonation {
  id: string;
  campaign_id: string;
  amount_cents: number;
  currency: string;
  is_anonymous: boolean;
  status: RecurringStatus;
  started_at: string;
  next_charge_at: string | null;
  cancelled_at: string | null;
  recurring_payment_method_ready?: boolean;
  campaign?: { title: string; slug: string };
}

export interface PaymentSession {
  donation_id: string;
  payment_id: string;
  client_secret: string;
  recurring_management_token?: string;
}

export interface RefundRequest {
  id: string;
  donation_id: string;
  reason: RefundRequestReason;
  details: string | null;
  status: RefundRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  decision_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Refund {
  id: string;
  refund_request_id: string;
  donation_id: string;
  hyperswitch_refund_id: string;
  hyperswitch_payment_id: string;
  amount_cents: number;
  currency: string;
  provider_reason: "duplicate" | "fraudulent" | "requested_by_customer";
  status: RefundStatus;
  provider_updated_at: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface RefundRequestView {
  donation: Pick<Donation, "id" | "amount_cents" | "currency" | "frequency" | "status" | "created_at" | "completed_at"> & {
    campaign: { title: string; slug: string };
  };
  eligibility: "eligible" | "ineligible" | "refunded";
  refund_request: Pick<RefundRequest, "id" | "reason" | "details" | "status" | "decision_note" | "created_at" | "reviewed_at"> | null;
  refund: Pick<Refund, "status" | "provider_updated_at" | "completed_at"> | null;
}
