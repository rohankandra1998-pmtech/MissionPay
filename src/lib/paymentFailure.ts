import type { PaymentFailureReason } from "../types/domain";

const machineCodes: Record<string, PaymentFailureReason> = {
  insufficient_funds: "insufficient_funds",
  card_declined: "card_declined",
  generic_decline: "card_declined",
  do_not_honor: "card_declined",
  lost_card: "lost_card",
  stolen_card: "stolen_card",
  card_lost_or_stolen: "card_unavailable",
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
  "payment declined: insufficient funds": "insufficient_funds",
  "card declined": "card_declined",
  "payment declined: card declined": "card_declined",
  "lost card": "lost_card",
  "payment declined: lost card": "lost_card",
  "stolen card": "stolen_card",
  "payment declined: stolen card": "stolen_card",
};

export interface PaymentFailureContent {
  eyebrow: string;
  headline: string;
  guidance: string;
  body: string;
  action: string;
}

const cardUnavailableContent: PaymentFailureContent = {
  eyebrow: "Payment declined",
  headline: "This card can't be used for this payment.",
  guidance: "Try another payment method or contact your bank.",
  body: "Your donation was not charged. Try another payment method or contact your bank if you need help with this card. The donation was not added to the campaign total.",
  action: "Try another payment method",
};

export const paymentFailureContent: Record<PaymentFailureReason, PaymentFailureContent> = {
  insufficient_funds: { eyebrow: "Payment declined", headline: "There aren't enough funds on this card.", guidance: "Try another payment method, or add funds and try again.", body: "Your donation was not charged or added to the campaign total. Try another payment method, or add funds and try again.", action: "Try another payment method" },
  card_declined: { eyebrow: "Payment declined", headline: "Your card was declined.", guidance: "Try another payment method or contact your bank if this continues.", body: "Your donation was not charged or added to the campaign total. Try another payment method or contact your bank if this continues.", action: "Try another payment method" },
  lost_card: { eyebrow: "Payment declined", headline: "This card has been reported lost.", guidance: "Please use another payment method or contact your bank.", body: "Your donation was not charged or added to the campaign total. Please use another payment method or contact your bank.", action: "Try another payment method" },
  stolen_card: { eyebrow: "Payment declined", headline: "This card has been reported stolen.", guidance: "Please use another payment method or contact your bank.", body: "Your donation was not charged or added to the campaign total. Please use another payment method or contact your bank.", action: "Try another payment method" },
  card_unavailable: cardUnavailableContent,
  authentication_failed: { eyebrow: "Payment not verified", headline: "We couldn't verify this payment with your bank.", guidance: "Try again and complete the verification step, or use another payment method.", body: "Your donation was not completed or added to the campaign total. Try again and complete your bank's verification step, or use another payment method.", action: "Try again" },
  invalid_cvv: { eyebrow: "Payment not completed", headline: "The card security code wasn't accepted.", guidance: "Check it and try again.", body: "Your donation was not charged or added to the campaign total. Check the security code and try again, or use another payment method.", action: "Try again" },
  expired_card: { eyebrow: "Payment not completed", headline: "This card has expired.", guidance: "Use another payment method.", body: "Your donation was not charged or added to the campaign total. Use another payment method to complete your donation.", action: "Try another payment method" },
  invalid_card: { eyebrow: "Payment not completed", headline: "The card details weren't accepted.", guidance: "Check them or use another payment method.", body: "Your donation was not charged or added to the campaign total. Check the details or use another payment method.", action: "Try again" },
  payment_cancelled: { eyebrow: "Payment cancelled", headline: "Payment cancelled.", guidance: "Nothing was charged, so you can safely try again.", body: "Nothing was charged and the donation was not added to the campaign total.", action: "Try again" },
  session_expired: { eyebrow: "Session expired", headline: "Your payment session expired.", guidance: "Restart the donation to try again.", body: "Nothing was charged or added to the campaign total. Start the payment again to complete your donation.", action: "Restart payment" },
  technical_error: { eyebrow: "Payment not completed", headline: "We couldn't process this payment right now.", guidance: "Try again in a moment or use another payment method.", body: "Your donation was not charged or added to the campaign total. Please try again in a moment or use another payment method.", action: "Try again" },
  unknown: { eyebrow: "Payment not completed", headline: "Your payment couldn't be completed.", guidance: "Check your payment details or try another payment method.", body: "Your donation was not charged or added to the campaign total. You can safely try again.", action: "Try again" },
};

export const checkoutFailureCopy: Record<PaymentFailureReason, string> = Object.fromEntries(
  Object.entries(paymentFailureContent).map(([reason, content]) => [reason, `${content.headline} ${content.guidance}`]),
) as Record<PaymentFailureReason, string>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalized(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLowerCase() : "";
}

function reasonFromCode(value: unknown): PaymentFailureReason | null {
  const code = normalized(value);
  if (!code || code === "ue_9000" || code === "dc_08") return null;
  return machineCodes[code] ?? null;
}

function fauxpaySandboxCompatibilityReason(result: Record<string, unknown>, error: Record<string, unknown>, unified: Record<string, unknown>, connector: Record<string, unknown>): PaymentFailureReason | null {
  const matchesInsufficientFundsScenario = normalized(error.connector || result.connector) === "fauxpay"
    && normalized(error.error_code || result.error_code) === "dc_08"
    && normalized(error.unified_code || result.unified_code) === "ue_9000"
    && normalized(unified.category) === "ue_9000"
    && normalized(connector.code) === "dc_08"
    && normalized(connector.message) === "payment declined: internal server error from connector, please try again later";
  return matchesInsufficientFundsScenario ? "insufficient_funds" : null;
}

export function classifyCheckoutFailure(value: unknown): PaymentFailureReason {
  const result = record(value);
  const error = record(result.error);
  const errorDetails = record(error.error_details || result.error_details);
  const unified = record(errorDetails.unified_details);
  const connector = record(errorDetails.connector_details);
  const issuer = record(errorDetails.issuer_details);
  const exactIssuerReason = machineCodes[normalized(issuer.message)];
  if (exactIssuerReason === "lost_card" || exactIssuerReason === "stolen_card") return exactIssuerReason;
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

  for (const candidate of [error.message, error.error_message, result.error_message, result.unified_message]) {
    const reason = documentedMessages[normalized(candidate)];
    if (reason) return reason;
  }
  const fauxpayCompatibilityReason = fauxpaySandboxCompatibilityReason(result, error, unified, connector);
  if (fauxpayCompatibilityReason) return fauxpayCompatibilityReason;
  return "unknown";
}

export function checkoutFailureMessage(value: unknown) {
  return checkoutFailureCopy[classifyCheckoutFailure(value)];
}

export function isPaymentFailureReason(value: unknown): value is PaymentFailureReason {
  return typeof value === "string" && value in paymentFailureContent;
}

export function resultRequiresSdkRedirect(value: unknown) {
  const result = record(value);
  const nextAction = record(result.next_action);
  const actionType = normalized(nextAction.type);
  return actionType.includes("redirect") || typeof nextAction.redirect_to_url === "string";
}
