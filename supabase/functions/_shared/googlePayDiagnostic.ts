export const googlePayDiagnosticEventTypes = [
  "hook_installed",
  "load_payment_data_rejection",
  "gpay_message_error",
  "hook_unavailable",
] as const;

export type GooglePayDiagnosticEventType = typeof googlePayDiagnosticEventTypes[number];

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function text(value: unknown, maximum = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maximum) : null;
}

function safeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const safe = value.slice(0, 20).map((item) => text(item, 100)).filter((item): item is string => Boolean(item));
  return safe.length ? safe : undefined;
}

export function sanitizeDiagnosticError(value: unknown) {
  const source = record(value);
  return {
    error_name: text(source?.name),
    error_status_code: text(source?.statusCode),
    error_status_message: text(source?.statusMessage),
    error_message: text(source?.message),
  };
}

export function sanitizeDiagnosticRequest(value: unknown): Record<string, unknown> {
  const source = record(value);
  if (!source) return {};
  const merchant = record(source.merchantInfo);
  const methods = Array.isArray(source.allowedPaymentMethods) ? source.allowedPaymentMethods : [];
  const card = methods.map(record).find((method) => method?.type === "CARD");
  const cardParameters = record(card?.parameters);
  const tokenization = record(card?.tokenizationSpecification);
  const tokenizationParameters = record(tokenization?.parameters);
  const safe: Record<string, unknown> = {};
  if (typeof source.apiVersion === "number" && Number.isSafeInteger(source.apiVersion) && source.apiVersion >= 0 && source.apiVersion <= 100) safe.apiVersion = source.apiVersion;
  if (typeof source.apiVersionMinor === "number" && Number.isSafeInteger(source.apiVersionMinor) && source.apiVersionMinor >= 0 && source.apiVersionMinor <= 100) safe.apiVersionMinor = source.apiVersionMinor;

  const merchantClassification = ["bcr", "numeric", "other", "missing"].includes(String(merchant?.merchantIdClassification))
    ? merchant?.merchantIdClassification
    : "missing";
  const safeMerchant: Record<string, unknown> = {
    merchantIdPresent: merchant?.merchantIdPresent === true,
    merchantIdClassification: merchantClassification,
  };
  const merchantName = text(merchant?.merchantName);
  if (merchantName) safeMerchant.merchantName = merchantName;
  safe.merchantInfo = safeMerchant;

  const safeCardParameters: Record<string, unknown> = {};
  const authMethods = safeStringArray(cardParameters?.allowedAuthMethods);
  const networks = safeStringArray(cardParameters?.allowedCardNetworks);
  if (authMethods) safeCardParameters.allowedAuthMethods = authMethods;
  if (networks) safeCardParameters.allowedCardNetworks = networks;
  const safeMethod: Record<string, unknown> = { type: "CARD", parameters: safeCardParameters };

  const keyMode = ["pk_test", "pk_live", "other", "missing"].includes(String(tokenizationParameters?.stripe_publishable_key_mode))
    ? tokenizationParameters?.stripe_publishable_key_mode
    : "missing";
  const safeTokenizationParameters: Record<string, unknown> = {
    stripe_publishable_key_present: tokenizationParameters?.stripe_publishable_key_present === true,
    stripe_publishable_key_mode: keyMode,
  };
  const type = text(tokenization?.type, 100);
  const gateway = text(tokenizationParameters?.gateway, 100);
  const stripeVersion = text(tokenizationParameters?.["stripe:version"], 100);
  if (gateway) safeTokenizationParameters.gateway = gateway;
  if (stripeVersion) safeTokenizationParameters["stripe:version"] = stripeVersion;
  const safeTokenization: Record<string, unknown> = { parameters: safeTokenizationParameters };
  if (type) safeTokenization.type = type;
  safeMethod.tokenizationSpecification = safeTokenization;
  safe.allowedPaymentMethods = [safeMethod];
  return safe;
}

export function isGooglePayDiagnosticEventType(value: unknown): value is GooglePayDiagnosticEventType {
  return typeof value === "string" && (googlePayDiagnosticEventTypes as readonly string[]).includes(value);
}
