export const GOOGLE_PAY_HOOK_TIMEOUT_MS = 5_000;
export const GOOGLE_PAY_HOOK_POLL_MS = 100;

export type GooglePayDiagnosticEventType =
  | "hook_installed"
  | "load_payment_data_rejection"
  | "gpay_message_error"
  | "hook_unavailable";

export interface GooglePayDiagnosticEvent {
  event_type: GooglePayDiagnosticEventType;
  error?: Record<string, string>;
  request_snapshot?: Record<string, unknown>;
}

type Reporter = (event: GooglePayDiagnosticEvent) => unknown;
type LoadPaymentData = (this: unknown, ...args: unknown[]) => unknown;

interface HookState {
  original: LoadPaymentData;
  wrapper: LoadPaymentData;
  observers: Set<(error: unknown, request: unknown) => void>;
  stripePublishableKey?: string;
}

const hooks = new WeakMap<object, HookState>();
const lifecycleReports = new Map<string, "hook_installed" | "hook_unavailable">();

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && (typeof value === "object" || typeof value === "function") ? value as Record<string, unknown> : undefined;
}

function read(value: unknown, key: string): unknown {
  try {
    return record(value)?.[key];
  } catch {
    return undefined;
  }
}

function trimmedString(value: unknown, maximum = 500): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maximum) : undefined;
}

function validStripePublishableKey(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length > 500) return undefined;
  return trimmed.startsWith("pk_test_") || trimmed.startsWith("pk_live_") ? trimmed : undefined;
}

function hasNonBlankString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

// Temporary compatibility for Hyperswitch sandbox Stripe-backed Google Pay
// requests that omit Google's required Stripe tokenization metadata.
export function prepareStripeGooglePayRequest(request: unknown, publishableKey: unknown): unknown {
  const safePublishableKey = validStripePublishableKey(publishableKey);
  const source = record(request);
  const paymentMethods = read(source, "allowedPaymentMethods");
  if (!safePublishableKey || !source || !Array.isArray(paymentMethods)) return request;

  let changed = false;
  const correctedMethods = paymentMethods.map((method) => {
    if (read(method, "type") !== "CARD") return method;
    const tokenization = read(method, "tokenizationSpecification");
    if (read(tokenization, "type") !== "PAYMENT_GATEWAY") return method;
    const parameters = read(tokenization, "parameters");
    if (read(parameters, "gateway") !== "stripe") return method;

    const needsVersion = !hasNonBlankString(read(parameters, "stripe:version"));
    const needsPublishableKey = !hasNonBlankString(read(parameters, "stripe:publishableKey"));
    if (!needsVersion && !needsPublishableKey) return method;

    changed = true;
    return {
      ...record(method),
      tokenizationSpecification: {
        ...record(tokenization),
        parameters: {
          ...record(parameters),
          ...(needsVersion ? { "stripe:version": "2018-10-31" } : {}),
          ...(needsPublishableKey ? { "stripe:publishableKey": safePublishableKey } : {}),
        },
      },
    };
  });

  return changed ? { ...source, allowedPaymentMethods: correctedMethods } : request;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const sanitized = value.slice(0, 20).map((item) => trimmedString(item, 100)).filter((item): item is string => Boolean(item));
  return sanitized.length ? sanitized : undefined;
}

export function sanitizeGooglePayError(value: unknown): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const key of ["name", "statusCode", "statusMessage", "message"] as const) {
    const sanitized = trimmedString(read(value, key));
    if (sanitized) safe[key] = sanitized;
  }
  return safe;
}

function classifyMerchantId(value: unknown): "bcr" | "numeric" | "other" | "missing" {
  const merchantId = trimmedString(value, 500);
  if (!merchantId) return "missing";
  if (/^BCR/i.test(merchantId)) return "bcr";
  if (/^\d+$/.test(merchantId)) return "numeric";
  return "other";
}

function classifyPublishableKey(value: unknown): "pk_test" | "pk_live" | "other" | "missing" {
  const key = trimmedString(value, 500);
  if (!key) return "missing";
  if (key.startsWith("pk_test_")) return "pk_test";
  if (key.startsWith("pk_live_")) return "pk_live";
  return "other";
}

export function sanitizeGooglePayRequest(value: unknown): Record<string, unknown> {
  const merchantInfo = read(value, "merchantInfo");
  const allowedPaymentMethods = read(value, "allowedPaymentMethods");
  const card = Array.isArray(allowedPaymentMethods)
    ? allowedPaymentMethods.find((method) => trimmedString(read(method, "type"), 20) === "CARD")
    : undefined;
  const parameters = read(card, "parameters");
  const tokenization = read(card, "tokenizationSpecification");
  const tokenizationParameters = read(tokenization, "parameters");
  const merchantId = read(merchantInfo, "merchantId");
  const publishableKey = read(tokenizationParameters, "stripe:publishableKey");
  const snapshot: Record<string, unknown> = {};

  const apiVersion = read(value, "apiVersion");
  const apiVersionMinor = read(value, "apiVersionMinor");
  if (typeof apiVersion === "number" && Number.isFinite(apiVersion)) snapshot.apiVersion = apiVersion;
  if (typeof apiVersionMinor === "number" && Number.isFinite(apiVersionMinor)) snapshot.apiVersionMinor = apiVersionMinor;

  const safeMerchantInfo: Record<string, unknown> = {
    merchantIdPresent: typeof merchantId === "string" && merchantId.trim().length > 0,
    merchantIdClassification: classifyMerchantId(merchantId),
  };
  const merchantName = trimmedString(read(merchantInfo, "merchantName"));
  if (merchantName) safeMerchantInfo.merchantName = merchantName;
  snapshot.merchantInfo = safeMerchantInfo;

  const safeCardParameters: Record<string, unknown> = {};
  const allowedAuthMethods = stringArray(read(parameters, "allowedAuthMethods"));
  const allowedCardNetworks = stringArray(read(parameters, "allowedCardNetworks"));
  if (allowedAuthMethods) safeCardParameters.allowedAuthMethods = allowedAuthMethods;
  if (allowedCardNetworks) safeCardParameters.allowedCardNetworks = allowedCardNetworks;
  const safeCard: Record<string, unknown> = { type: "CARD", parameters: safeCardParameters };

  const safeTokenizationParameters: Record<string, unknown> = {
    stripe_publishable_key_present: typeof publishableKey === "string" && publishableKey.trim().length > 0,
    stripe_publishable_key_mode: classifyPublishableKey(publishableKey),
  };
  const type = trimmedString(read(tokenization, "type"), 100);
  const gateway = trimmedString(read(tokenizationParameters, "gateway"), 100);
  const stripeVersion = trimmedString(read(tokenizationParameters, "stripe:version"), 100);
  if (gateway) safeTokenizationParameters.gateway = gateway;
  if (stripeVersion) safeTokenizationParameters["stripe:version"] = stripeVersion;
  const safeTokenization: Record<string, unknown> = { parameters: safeTokenizationParameters };
  if (type) safeTokenization.type = type;
  safeCard.tokenizationSpecification = safeTokenization;
  snapshot.allowedPaymentMethods = [safeCard];
  return snapshot;
}

function safelyReport(reporter: Reporter, event: GooglePayDiagnosticEvent) {
  try {
    Promise.resolve(reporter(event)).catch(() => undefined);
  } catch {
    // Diagnostics must never affect checkout.
  }
}

function paymentsPrototype(target: Window & typeof globalThis): { prototype: object; method: LoadPaymentData } | undefined {
  const google = read(target, "google");
  const payments = read(google, "payments");
  const api = read(payments, "api");
  const client = read(api, "PaymentsClient");
  const prototype = read(client, "prototype");
  const method = read(prototype, "loadPaymentData");
  return prototype && typeof method === "function" ? { prototype, method: method as LoadPaymentData } : undefined;
}

function subscribeToHook(
  target: Window & typeof globalThis,
  observer: HookState["observers"] extends Set<infer T> ? T : never,
  stripePublishableKey: unknown,
): (() => void) | undefined {
  const available = paymentsPrototype(target);
  if (!available) return undefined;
  let state = hooks.get(available.prototype);
  if (!state || read(available.prototype, "loadPaymentData") !== state.wrapper) {
    const original = available.method;
    const observers = new Set<(error: unknown, request: unknown) => void>();
    let createdState: HookState;
    const wrapper: LoadPaymentData = function (this: unknown, ...args: unknown[]) {
      let forwardedArgs = args;
      try {
        const correctedRequest = prepareStripeGooglePayRequest(args[0], createdState.stripePublishableKey);
        if (correctedRequest !== args[0]) forwardedArgs = [correctedRequest, ...args.slice(1)];
      } catch {
        // Compatibility preparation fails open to Hyperswitch's original request.
      }
      const result = Reflect.apply(original, this, forwardedArgs);
      try {
        const then = read(result, "then");
        if (typeof then === "function") {
          (result as Promise<unknown>).then(undefined, (error: unknown) => {
            for (const notify of [...observers]) {
              try { notify(error, forwardedArgs[0]); } catch { /* observer-only failure */ }
            }
          });
        }
      } catch {
        // Observing a returned promise must not change the SDK result.
      }
      return result;
    };
    createdState = { original, wrapper, observers, stripePublishableKey: validStripePublishableKey(stripePublishableKey) };
    state = createdState;
    hooks.set(available.prototype, state);
    try {
      (available.prototype as Record<string, unknown>).loadPaymentData = wrapper;
      if (read(available.prototype, "loadPaymentData") !== wrapper) {
        hooks.delete(available.prototype);
        return undefined;
      }
    } catch {
      hooks.delete(available.prototype);
      return undefined;
    }
  } else {
    state.stripePublishableKey = validStripePublishableKey(stripePublishableKey) ?? state.stripePublishableKey;
  }
  state.observers.add(observer);
  return () => {
    state?.observers.delete(observer);
    if (!state || state.observers.size > 0) return;
    if (read(available.prototype, "loadPaymentData") === state.wrapper) {
      try { (available.prototype as Record<string, unknown>).loadPaymentData = state.original; } catch { /* best-effort cleanup */ }
    }
    if (hooks.get(available.prototype) === state) hooks.delete(available.prototype);
  };
}

function messageGooglePayError(data: unknown): unknown {
  const direct = read(data, "gpayError");
  if (direct !== undefined) return direct;
  const nestedData = read(read(data, "data"), "gpayError");
  if (nestedData !== undefined) return nestedData;
  return read(read(data, "message"), "gpayError");
}

export function installGooglePayDiagnostics({
  donationId,
  report,
  target = window,
  stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY,
}: {
  donationId: string;
  report: Reporter;
  target?: Window & typeof globalThis;
  stripePublishableKey?: string;
}): () => void {
  let active = true;
  let unsubscribe: (() => void) | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let unavailableTimer: ReturnType<typeof setTimeout> | undefined;

  const reportLifecycle = (event_type: "hook_installed" | "hook_unavailable") => {
    if (lifecycleReports.has(donationId)) return;
    lifecycleReports.set(donationId, event_type);
    safelyReport(report, { event_type });
  };
  const stopWaiting = () => {
    if (pollTimer !== undefined) target.clearInterval(pollTimer);
    if (unavailableTimer !== undefined) target.clearTimeout(unavailableTimer);
    pollTimer = undefined;
    unavailableTimer = undefined;
  };
  const attemptInstall = () => {
    if (!active || unsubscribe) return;
    unsubscribe = subscribeToHook(target, (error, request) => {
      let safeError: Record<string, string> = {};
      let requestSnapshot: Record<string, unknown> = {};
      try { safeError = sanitizeGooglePayError(error); } catch { /* sanitized empty */ }
      try { requestSnapshot = sanitizeGooglePayRequest(request); } catch { /* sanitized empty */ }
      safelyReport(report, { event_type: "load_payment_data_rejection", error: safeError, request_snapshot: requestSnapshot });
    }, stripePublishableKey);
    if (unsubscribe) {
      stopWaiting();
      reportLifecycle("hook_installed");
    }
  };
  const onMessage = (event: MessageEvent) => {
    const error = messageGooglePayError(event.data);
    if (error === undefined) return;
    let safeError: Record<string, string> = {};
    try { safeError = sanitizeGooglePayError(error); } catch { /* sanitized empty */ }
    safelyReport(report, { event_type: "gpay_message_error", error: safeError });
  };

  target.addEventListener("message", onMessage);
  attemptInstall();
  if (!unsubscribe) {
    pollTimer = target.setInterval(attemptInstall, GOOGLE_PAY_HOOK_POLL_MS);
    unavailableTimer = target.setTimeout(() => {
      if (!active || unsubscribe) return;
      stopWaiting();
      reportLifecycle("hook_unavailable");
    }, GOOGLE_PAY_HOOK_TIMEOUT_MS);
  }

  return () => {
    active = false;
    stopWaiting();
    target.removeEventListener("message", onMessage);
    unsubscribe?.();
    unsubscribe = undefined;
  };
}
