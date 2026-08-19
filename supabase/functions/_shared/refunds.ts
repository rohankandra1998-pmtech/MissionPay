export const REFUND_REASONS = ["incorrect_amount", "duplicate", "unauthorized", "other"] as const;
export type RefundRequestReason = typeof REFUND_REASONS[number];
export type ProviderRefundReason = "duplicate" | "fraudulent" | "requested_by_customer";
export type RefundStatus = "initiating" | "pending" | "review" | "succeeded" | "failed";

export function isRefundRequestReason(value: unknown): value is RefundRequestReason {
  return typeof value === "string" && REFUND_REASONS.includes(value as RefundRequestReason);
}

export function validateRefundDetails(reason: RefundRequestReason, value: unknown) {
  const details = typeof value === "string" ? value.trim() : "";
  if (details.length > 500) return { error: "Please keep the explanation to 500 characters or fewer." };
  if (reason === "other" && details.length < 2) return { error: "Please briefly explain the refund request." };
  return { details: details || null };
}

export function refundEligibility(donation: { status: string; hyperswitch_payment_id?: unknown }) {
  if (donation.status === "refunded") return "refunded" as const;
  if (donation.status !== "succeeded" || typeof donation.hyperswitch_payment_id !== "string" || !donation.hyperswitch_payment_id.trim()) {
    return "ineligible" as const;
  }
  return "eligible" as const;
}

export function refundRequestSubmissionDecision(
  donation: { status: string; hyperswitch_payment_id?: unknown },
  existingRequest: unknown,
) {
  if (existingRequest) return "existing" as const;
  return refundEligibility(donation) === "eligible" ? "create" as const : "ineligible" as const;
}

export function providerReason(reason: RefundRequestReason): ProviderRefundReason {
  if (reason === "duplicate") return "duplicate";
  if (reason === "unauthorized") return "fraudulent";
  return "requested_by_customer";
}

export function providerRefundId(refundRequestId: string) {
  const compact = refundRequestId.replaceAll("-", "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(compact)) throw new Error("refund_request_id_invalid");
  return `ref_${compact}`;
}

export function buildRefundPayload(input: {
  donationId: string;
  refundRequestId: string;
  paymentId: string;
  amountCents: number;
  reason: RefundRequestReason;
}) {
  return {
    payment_id: input.paymentId,
    refund_id: providerRefundId(input.refundRequestId),
    amount: input.amountCents,
    refund_type: "instant" as const,
    reason: providerReason(input.reason),
    metadata: {
      missionpay_donation_id: input.donationId,
      missionpay_refund_request_id: input.refundRequestId,
    },
  };
}

export function buildLocalRefundIdentity(input: {
  donationId: string;
  refundRequestId: string;
  paymentId: string;
  amountCents: number;
  currency: string;
  reason: RefundRequestReason;
}) {
  return {
    id: input.refundRequestId,
    refund_request_id: input.refundRequestId,
    donation_id: input.donationId,
    hyperswitch_refund_id: providerRefundId(input.refundRequestId),
    hyperswitch_payment_id: input.paymentId,
    amount_cents: input.amountCents,
    currency: input.currency,
    provider_reason: providerReason(input.reason),
    status: "initiating" as const,
  };
}

export function normalizeRefundStatus(value: unknown): Exclude<RefundStatus, "initiating"> {
  if (value === "succeeded" || value === "failed" || value === "pending" || value === "review") return value;
  throw new Error("Unsupported Hyperswitch refund status");
}

export function refundReconciliationUpdate(
  currentStatus: RefundStatus,
  providerRefund: Record<string, unknown>,
  fallbackTime = new Date(),
) {
  if (currentStatus === "succeeded") return null;
  const status = normalizeRefundStatus(providerRefund.status);
  const providerUpdatedAt = typeof providerRefund.updated_at === "string"
    ? new Date(providerRefund.updated_at)
    : fallbackTime;
  if (Number.isNaN(providerUpdatedAt.getTime())) throw new Error("Invalid Hyperswitch refund timestamp");
  return {
    status,
    provider_updated_at: providerUpdatedAt.toISOString(),
    execution_claimed_at: null,
    error_code: status === "failed" && typeof providerRefund.error_code === "string"
      ? providerRefund.error_code.slice(0, 120)
      : null,
    completed_at: status === "succeeded" ? providerUpdatedAt.toISOString() : null,
  };
}

export function shouldApplyRefundUpdate(currentStatus: RefundStatus, currentProviderUpdatedAt: string | null, incomingProviderUpdatedAt: Date) {
  if (currentStatus === "succeeded") return false;
  return !currentProviderUpdatedAt || new Date(currentProviderUpdatedAt) <= incomingProviderUpdatedAt;
}

export function sanitizedRefundEventPayload(event: Record<string, unknown>, object: Record<string, unknown>) {
  return {
    event_id: typeof event.event_id === "string" ? event.event_id : undefined,
    type: typeof event.type === "string" ? event.type : "unknown",
    timestamp: typeof event.timestamp === "string" ? event.timestamp : undefined,
    content: {
      type: "refund_details",
      object: {
        refund_id: typeof object.refund_id === "string" ? object.refund_id : undefined,
        payment_id: typeof object.payment_id === "string" ? object.payment_id : undefined,
        amount: typeof object.amount === "number" ? object.amount : undefined,
        currency: typeof object.currency === "string" ? object.currency : undefined,
        status: typeof object.status === "string" ? object.status : undefined,
        error_code: typeof object.error_code === "string" ? object.error_code.slice(0, 120) : undefined,
        created_at: typeof object.created_at === "string" ? object.created_at : undefined,
        updated_at: typeof object.updated_at === "string" ? object.updated_at : undefined,
      },
    },
  };
}
