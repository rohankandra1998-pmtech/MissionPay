export const PAYMENT_FAILURE_REASONS = [
  "insufficient_funds",
  "card_declined",
  "lost_card",
  "stolen_card",
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
  lost_card: "lost_card",
  stolen_card: "stolen_card",
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

// Hyperswitch's Dummy connector can expose these scenario labels in documented
// message/reason fields without a useful machine code. This intentionally exact
// allowlist is never used for arbitrary prose or substring matching.
const exactDummyTexts: Record<string, PaymentFailureReason> = {
  "insufficient funds": "insufficient_funds",
  "payment declined: insufficient funds": "insufficient_funds",
  "card declined": "card_declined",
  "payment declined: card declined": "card_declined",
  "lost card": "lost_card",
  "payment declined: lost card": "lost_card",
  "stolen card": "stolen_card",
  "payment declined: stolen card": "stolen_card",
  "restricted card": "card_unavailable",
  "unsupported card": "card_unavailable",
  "card not supported": "card_unavailable",
  "invalid cvv": "invalid_cvv",
  "expired card": "expired_card",
  "authentication failed": "authentication_failed",
};

// Exact customer guidance published in Hyperswitch's unified error-code table.
// It is classification input only; MissionPay still owns all donor-facing copy.
const exactGuidanceTexts: Record<string, PaymentFailureReason> = {
  "there aren't enough funds on this card. use another card or add funds and try again": "insufficient_funds",
  "there aren’t enough funds on this card. use another card or add funds and try again": "insufficient_funds",
  "the bank has blocked this card. please use a different card.": "card_unavailable",
  "this card can't be used for this payment. try another card or payment method.": "card_unavailable",
  "this card can’t be used for this payment. try another card or payment method.": "card_unavailable",
  "the security code (cvv) is incorrect. please re-enter it.": "invalid_cvv",
  "we couldn't verify this payment with your bank. try again or use a different payment method.": "authentication_failed",
  "we couldn’t verify this payment with your bank. try again or use a different payment method.": "authentication_failed",
  "your session expired. start the payment again.": "session_expired",
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function code(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedText(value: unknown) {
  return code(value).replace(/\s+/g, " ").toLowerCase();
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

function errorLayers(source: Record<string, unknown>) {
  const errorDetails = record(source.error_details);
  const unifiedDetails = record(errorDetails.unified_details);
  const connectorDetails = record(errorDetails.connector_details);
  const issuerDetails = record(errorDetails.issuer_details);
  return { errorDetails, unifiedDetails, connectorDetails, issuerDetails };
}

function machineReasonFromSource(source: Record<string, unknown>): PaymentFailureReason | null {
  const { unifiedDetails, connectorDetails, issuerDetails } = errorLayers(source);
  for (const candidate of [
    unifiedDetails.standardised_code,
    unifiedDetails.standardized_code,
  ]) {
    const reason = machineCodeReason(candidate);
    if (reason) return reason;
  }

  const category = code(unifiedDetails.category || source.unified_code).toUpperCase();
  if (["UE_2000", "UE_3000", "UE_4000"].includes(category)) return "technical_error";

  for (const candidate of [
    connectorDetails.code,
    issuerDetails.code,
    source.error_code,
    source.issuer_error_code,
  ]) {
    const reason = machineCodeReason(candidate);
    if (reason) return reason;
  }

  const providerStatus = code(source.status).toLowerCase();
  if (providerStatus === "authentication_failed") return "authentication_failed";
  if (["cancelled", "voided"].includes(providerStatus) && code(source.cancellation_reason).toLowerCase() === "requested_by_customer") return "payment_cancelled";
  return null;
}

function exactTextReasonFromSource(source: Record<string, unknown>): PaymentFailureReason | null {
  const { unifiedDetails, connectorDetails, issuerDetails } = errorLayers(source);
  for (const candidate of [
    connectorDetails.reason,
    connectorDetails.message,
    issuerDetails.message,
    source.error_message,
    source.unified_message,
    unifiedDetails.message,
    unifiedDetails.description,
  ]) {
    const reason = exactDummyTexts[normalizedText(candidate)];
    if (reason) return reason;
  }
  return null;
}

function guidanceReasonFromSource(source: Record<string, unknown>): PaymentFailureReason | null {
  const { unifiedDetails } = errorLayers(source);
  return exactGuidanceTexts[normalizedText(unifiedDetails.user_guidance_message)] ?? null;
}

export function isPaymentFailureReason(value: unknown): value is PaymentFailureReason {
  return typeof value === "string" && PAYMENT_FAILURE_REASONS.includes(value as PaymentFailureReason);
}

export function normalizePaymentFailure(providerPayment: Record<string, unknown>): PaymentFailureReason {
  const attempt = authoritativeAttempt(providerPayment.attempts);
  for (const classifier of [machineReasonFromSource, exactTextReasonFromSource, guidanceReasonFromSource]) {
    const attemptReason = classifier(attempt);
    if (attemptReason) return attemptReason;
  }
  for (const classifier of [machineReasonFromSource, exactTextReasonFromSource, guidanceReasonFromSource]) {
    const topLevelReason = classifier(providerPayment);
    if (topLevelReason) return topLevelReason;
  }
  return "unknown";
}

function pickStrings(source: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.flatMap((key) => code(source[key]) ? [[key, code(source[key])]] : []));
}

function sanitizeErrorDetails(source: Record<string, unknown>) {
  const { unifiedDetails, connectorDetails, issuerDetails } = errorLayers(source);
  const errorDetails = {
    unified_details: pickStrings(unifiedDetails, ["standardised_code", "standardized_code", "category", "message", "description", "user_guidance_message"]),
    connector_details: pickStrings(connectorDetails, ["code", "message", "reason"]),
    issuer_details: pickStrings(issuerDetails, ["code", "message"]),
  };
  return Object.fromEntries(Object.entries(errorDetails).filter(([, value]) => Object.keys(value).length > 0));
}

export function sanitizePaymentFailureDiagnostic(providerPayment: Record<string, unknown>) {
  const topLevel = pickStrings(providerPayment, ["payment_id", "status", "connector", "error_code", "unified_code", "issuer_error_code", "cancellation_reason"]);
  const errorDetails = sanitizeErrorDetails(providerPayment);
  const attempts = Array.isArray(providerPayment.attempts)
    ? providerPayment.attempts.map(record).filter((attempt) => Object.keys(attempt).length > 0).map((attempt) => {
      const safeAttempt = pickStrings(attempt, ["attempt_id", "status", "connector", "error_code", "unified_code", "issuer_error_code", "cancellation_reason", "created_at", "modified_at", "updated_at"]);
      const attemptErrorDetails = sanitizeErrorDetails(attempt);
      return Object.keys(attemptErrorDetails).length ? { ...safeAttempt, error_details: attemptErrorDetails } : safeAttempt;
    })
    : [];
  return {
    ...topLevel,
    ...(Object.keys(errorDetails).length ? { error_details: errorDetails } : {}),
    ...(attempts.length ? { attempts } : {}),
  };
}
