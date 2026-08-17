export const PAYMENT_FAILURE_REASONS = [
  "insufficient_funds",
  "card_declined",
  "card_unavailable",
  "authentication_failed",
  "invalid_cvv",
  "expired_card",
  "invalid_card",
  "payment_cancelled",
  "session_expired",
  "technical_error",
  "unknown",
] as const;

export type PaymentFailureReason = (typeof PAYMENT_FAILURE_REASONS)[number];

const standardisedCodes: Record<string, PaymentFailureReason> = {
  INSUFFICIENT_FUNDS: "insufficient_funds",
  CREDIT_LIMIT_EXCEEDED: "card_declined",
  DO_NOT_HONOR: "card_declined",
  SUSPECTED_FRAUD: "card_declined",
  PSP_FRAUD_ENGINE_DECLINE: "card_declined",
  COMPLIANCE_OR_SANCTIONS_RESTRICTION: "card_declined",
  CARD_LOST_OR_STOLEN: "card_unavailable",
  CARD_NOT_SUPPORTED_RESTRICTED: "card_unavailable",
  ACCOUNT_CLOSED_OR_INVALID: "card_unavailable",
  TRANSACTION_NOT_PERMITTED: "card_unavailable",
  AUTHORIZATION_MISSING_OR_REVOKED: "card_unavailable",
  AUTHENTICATION_FAILED: "authentication_failed",
  INCORRECT_AUTHENTICATION_CODE: "authentication_failed",
  AUTHENTICATION_REQUIRED: "authentication_failed",
  INVALID_CVV: "invalid_cvv",
  INVALID_EXPIRY_DATE: "invalid_card",
  INVALID_CARD_NUMBER: "invalid_card",
  PAYMENT_METHOD_ISSUE: "invalid_card",
  PM_TOKENISATION_ISSUE: "invalid_card",
  PAYMENT_CANCELLED_BY_USER: "payment_cancelled",
  PAYMENT_SESSION_TIMEOUT: "session_expired",
  DOWNSTREAM_TECHNICAL_ISSUE: "technical_error",
  ISSUER_UNAVAILABLE: "technical_error",
  TRANSACTION_TIMEDOUT: "technical_error",
  REFUND_FAILED: "technical_error",
  CONFIGURATION_ERROR: "technical_error",
  CONNECTOR_CONFIGURATION_ERROR: "technical_error",
  CONNECTOR_UNAUTHORIZED: "technical_error",
  CONNECTOR_NOT_IMPLEMENTED: "technical_error",
  MISSING_REQUIRED_FIELD: "technical_error",
  INVALID_DATA_FORMAT: "technical_error",
};

const legacyCodes: Record<string, PaymentFailureReason> = {
  insufficient_funds: "insufficient_funds",
  card_declined: "card_declined",
  generic_decline: "card_declined",
  do_not_honor: "card_declined",
  lost_card: "card_unavailable",
  stolen_card: "card_unavailable",
  restricted_card: "card_unavailable",
  card_not_supported: "card_unavailable",
  authentication_failed: "authentication_failed",
  incorrect_cvc: "invalid_cvv",
  invalid_cvv: "invalid_cvv",
  invalid_cvc: "invalid_cvv",
  expired_card: "expired_card",
  invalid_card: "invalid_card",
  invalid_card_number: "invalid_card",
  incorrect_number: "invalid_card",
  payment_cancelled: "payment_cancelled",
  cancelled_by_user: "payment_cancelled",
  payment_session_timeout: "session_expired",
  session_expired: "session_expired",
  processing_error: "technical_error",
  issuer_not_available: "technical_error",
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function code(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function timestamp(value: unknown) {
  const parsed = Date.parse(code(value));
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function authoritativeAttempt(value: unknown): Record<string, unknown> {
  if (!Array.isArray(value)) return {};
  const attempts = value.map(record).filter((attempt) => Object.keys(attempt).length > 0);
  if (!attempts.length) return {};
  return attempts.reduce((latest, attempt) => {
    const latestTime = Math.max(timestamp(latest.modified_at), timestamp(latest.updated_at), timestamp(latest.created_at));
    const attemptTime = Math.max(timestamp(attempt.modified_at), timestamp(attempt.updated_at), timestamp(attempt.created_at));
    return attemptTime >= latestTime ? attempt : latest;
  });
}

function machineCodeReason(value: unknown) {
  const normalized = code(value).toLowerCase();
  if (!normalized || normalized === "ue_9000" || normalized === "dc_08") return null;
  return legacyCodes[normalized] ?? standardisedCodes[normalized.toUpperCase()] ?? null;
}

function reasonFromSource(source: Record<string, unknown>): PaymentFailureReason | null {
  const errorDetails = record(source.error_details);
  const unifiedDetails = record(errorDetails.unified_details);
  const connectorDetails = record(errorDetails.connector_details);
  const issuerDetails = record(errorDetails.issuer_details);
  const candidates = [
    unifiedDetails.standardised_code,
    unifiedDetails.standardized_code,
    source.unified_code,
    connectorDetails.code,
    source.error_code,
    issuerDetails.code,
    source.issuer_error_code,
  ];
  for (const candidate of candidates) {
    const reason = machineCodeReason(candidate);
    if (reason) return reason;
  }

  const category = code(unifiedDetails.category || source.unified_code).toUpperCase();
  if (["UE_2000", "UE_3000", "UE_4000"].includes(category)) return "technical_error";

  const providerStatus = code(source.status).toLowerCase();
  if (providerStatus === "authentication_failed") return "authentication_failed";
  if (["cancelled", "voided"].includes(providerStatus) && code(source.cancellation_reason).toLowerCase() === "requested_by_customer") return "payment_cancelled";
  return null;
}

export function isPaymentFailureReason(value: unknown): value is PaymentFailureReason {
  return typeof value === "string" && PAYMENT_FAILURE_REASONS.includes(value as PaymentFailureReason);
}

export function normalizePaymentFailure(providerPayment: Record<string, unknown>): PaymentFailureReason {
  const attemptReason = reasonFromSource(authoritativeAttempt(providerPayment.attempts));
  if (attemptReason) return attemptReason;
  const topLevelReason = reasonFromSource(providerPayment);
  if (topLevelReason) return topLevelReason;
  return "unknown";
}
