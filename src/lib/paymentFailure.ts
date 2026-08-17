import type { PaymentFailureReason } from "../types/domain";

const machineCodes: Record<string, PaymentFailureReason> = {
  insufficient_funds: "insufficient_funds",
  card_declined: "card_declined",
  generic_decline: "card_declined",
  do_not_honor: "card_declined",
  lost_card: "card_unavailable",
  stolen_card: "card_unavailable",
  restricted_card: "card_unavailable",
  card_not_supported: "card_unavailable",
  authentication_failed: "authentication_failed",
  incorrect_authentication_code: "authentication_failed",
  authentication_required: "authentication_failed",
  incorrect_cvc: "invalid_cvv",
  invalid_cvv: "invalid_cvv",
  invalid_cvc: "invalid_cvv",
  expired_card: "expired_card",
  invalid_expiry_date: "invalid_card",
  invalid_card: "invalid_card",
  invalid_card_number: "invalid_card",
  incorrect_number: "invalid_card",
  payment_cancelled_by_user: "payment_cancelled",
  payment_cancelled: "payment_cancelled",
  cancelled_by_user: "payment_cancelled",
  payment_session_timeout: "session_expired",
  session_expired: "session_expired",
  downstream_technical_issue: "technical_error",
  issuer_unavailable: "technical_error",
  transaction_timedout: "technical_error",
  processing_error: "technical_error",
  issuer_not_available: "technical_error",
};

// Hyperswitch documents these exact Dummy connector scenario labels. They are an
// intentionally narrow fallback for SDK errors that expose only type + message.
const documentedMessages: Record<string, PaymentFailureReason> = {
  "insufficient funds": "insufficient_funds",
  "card declined": "card_declined",
  "lost card": "card_unavailable",
  "stolen card": "card_unavailable",
};

export const checkoutFailureCopy: Record<PaymentFailureReason, string> = {
  insufficient_funds: "There aren't enough funds on this card. Try another payment method, or add funds and try again.",
  card_declined: "Your card was declined. Try another payment method or contact your bank if this continues.",
  card_unavailable: "This card can't be used for this payment. Try another payment method or contact your bank.",
  authentication_failed: "We couldn't verify this payment with your bank. Try again and complete the verification step, or use another payment method.",
  invalid_cvv: "The card security code wasn't accepted. Check it and try again.",
  expired_card: "This card has expired. Use another payment method.",
  invalid_card: "The card details weren't accepted. Check them or use another payment method.",
  payment_cancelled: "The payment was cancelled. Nothing was charged, so you can safely try again.",
  session_expired: "This payment session expired. Restart the donation to try again.",
  technical_error: "We couldn't process this payment right now. Try again in a moment or use another payment method.",
  unknown: "Your payment couldn't be completed. Check your payment details or try another payment method.",
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalized(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function reasonFromCode(value: unknown): PaymentFailureReason | null {
  const code = normalized(value);
  if (!code || code === "ue_9000" || code === "dc_08") return null;
  return machineCodes[code] ?? null;
}

export function classifyCheckoutFailure(value: unknown): PaymentFailureReason {
  const result = record(value);
  const error = record(result.error);
  const errorDetails = record(error.error_details || result.error_details);
  const unified = record(errorDetails.unified_details);
  const connector = record(errorDetails.connector_details);
  const issuer = record(errorDetails.issuer_details);
  const candidates = [
    unified.standardised_code,
    unified.standardized_code,
    error.unified_code,
    result.unified_code,
    connector.code,
    error.decline_code,
    error.error_code,
    error.code,
    issuer.code,
    result.issuer_error_code,
    result.error_code,
    result.status,
  ];

  for (const candidate of candidates) {
    const reason = reasonFromCode(candidate);
    if (reason) return reason;
  }

  const category = normalized(unified.category || error.unified_code || result.unified_code);
  if (["ue_2000", "ue_3000", "ue_4000"].includes(category)) return "technical_error";

  const exactMessage = normalized(error.message);
  return documentedMessages[exactMessage] ?? "unknown";
}

export function checkoutFailureMessage(value: unknown) {
  return checkoutFailureCopy[classifyCheckoutFailure(value)];
}

export function resultRequiresSdkRedirect(value: unknown) {
  const result = record(value);
  const nextAction = record(result.next_action);
  const actionType = normalized(nextAction.type);
  return actionType.includes("redirect") || typeof nextAction.redirect_to_url === "string";
}
