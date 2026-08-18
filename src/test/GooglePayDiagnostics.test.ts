import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GOOGLE_PAY_HOOK_POLL_MS,
  GOOGLE_PAY_HOOK_TIMEOUT_MS,
  installGooglePayDiagnostics,
  prepareStripeGooglePayRequest,
  sanitizeGooglePayError,
  sanitizeGooglePayRequest,
} from "../lib/googlePayDiagnostics";
import { isGooglePayDiagnosticEventType, sanitizeDiagnosticError, sanitizeDiagnosticRequest } from "../../supabase/functions/_shared/googlePayDiagnostic";
import edgeSource from "../../supabase/functions/google-pay-diagnostic/index.ts?raw";
import migrationSource from "../../supabase/migrations/20260818211904_google_pay_diagnostic_events.sql?raw";
import configSource from "../../supabase/config.toml?raw";
import checkoutSource from "../features/payments/HyperswitchCheckout.tsx?raw";

type LoadPaymentData = (this: unknown, ...args: unknown[]) => unknown;

function exposeGooglePay(loadPaymentData: LoadPaymentData) {
  function PaymentsClient() {}
  PaymentsClient.prototype.loadPaymentData = loadPaymentData;
  Object.defineProperty(window, "google", {
    configurable: true,
    writable: true,
    value: { payments: { api: { PaymentsClient } } },
  });
  return PaymentsClient.prototype;
}

function removeGooglePay() {
  Reflect.deleteProperty(window, "google");
}

afterEach(() => {
  vi.useRealTimers();
  removeGooglePay();
});

function stripeGooglePayRequest() {
  return {
    apiVersion: 2,
    apiVersionMinor: 0,
    merchantInfo: { merchantId: "123456789", merchantName: "MissionPay" },
    transactionInfo: { currencyCode: "USD", totalPrice: "25.00" },
    allowedPaymentMethods: [{
      type: "CARD",
      parameters: { allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"], allowedCardNetworks: ["VISA"] },
      tokenizationSpecification: { type: "PAYMENT_GATEWAY", parameters: { gateway: "stripe" } },
      unrelatedCardField: { keep: true },
    }],
    unrelatedRequestField: { keep: true },
  };
}

describe("temporary Stripe-backed Google Pay compatibility", () => {
  it("copy-on-write injects both missing Stripe tokenization fields without mutating the original", () => {
    const request = stripeGooglePayRequest();
    const originalSnapshot = structuredClone(request);

    const corrected = prepareStripeGooglePayRequest(request, "  pk_test_supplied_publishable_key  ") as ReturnType<typeof stripeGooglePayRequest>;
    const parameters = corrected.allowedPaymentMethods[0].tokenizationSpecification.parameters as Record<string, unknown>;

    expect(corrected).not.toBe(request);
    expect(parameters).toEqual({ gateway: "stripe", "stripe:version": "2018-10-31", "stripe:publishableKey": "pk_test_supplied_publishable_key" });
    expect(request).toEqual(originalSnapshot);
    expect(corrected.merchantInfo).toBe(request.merchantInfo);
    expect(corrected.transactionInfo).toBe(request.transactionInfo);
    expect(corrected.unrelatedRequestField).toBe(request.unrelatedRequestField);
    expect(corrected.allowedPaymentMethods[0].unrelatedCardField).toBe(request.allowedPaymentMethods[0].unrelatedCardField);
  });

  it("preserves an existing Stripe version while injecting only the missing publishable key", () => {
    const request = stripeGooglePayRequest();
    request.allowedPaymentMethods[0].tokenizationSpecification.parameters = { gateway: "stripe", "stripe:version": "2099-01-01" } as { gateway: string };

    const corrected = prepareStripeGooglePayRequest(request, "pk_test_supplied") as ReturnType<typeof stripeGooglePayRequest>;

    expect(corrected.allowedPaymentMethods[0].tokenizationSpecification.parameters).toEqual({ gateway: "stripe", "stripe:version": "2099-01-01", "stripe:publishableKey": "pk_test_supplied" });
  });

  it("preserves an existing publishable key while injecting only the missing Stripe version", () => {
    const request = stripeGooglePayRequest();
    request.allowedPaymentMethods[0].tokenizationSpecification.parameters = { gateway: "stripe", "stripe:publishableKey": "pk_live_hyperswitch_value" } as { gateway: string };

    const corrected = prepareStripeGooglePayRequest(request, "pk_test_supplied") as ReturnType<typeof stripeGooglePayRequest>;

    expect(corrected.allowedPaymentMethods[0].tokenizationSpecification.parameters).toEqual({ gateway: "stripe", "stripe:publishableKey": "pk_live_hyperswitch_value", "stripe:version": "2018-10-31" });
  });

  it("replaces blank tokenization fields but preserves non-blank values", () => {
    const request = stripeGooglePayRequest();
    request.allowedPaymentMethods[0].tokenizationSpecification.parameters = { gateway: "stripe", "stripe:version": "  ", "stripe:publishableKey": "" } as { gateway: string };

    const corrected = prepareStripeGooglePayRequest(request, "pk_test_supplied") as ReturnType<typeof stripeGooglePayRequest>;

    expect(corrected.allowedPaymentMethods[0].tokenizationSpecification.parameters).toEqual({ gateway: "stripe", "stripe:version": "2018-10-31", "stripe:publishableKey": "pk_test_supplied" });
  });

  it("returns the original request when Hyperswitch already provides both non-blank values", () => {
    const request = stripeGooglePayRequest();
    request.allowedPaymentMethods[0].tokenizationSpecification.parameters = { gateway: "stripe", "stripe:version": "existing-version", "stripe:publishableKey": "pk_live_existing" } as { gateway: string };

    const corrected = prepareStripeGooglePayRequest(request, "pk_test_supplied");

    expect(corrected).toBe(request);
    expect(request.allowedPaymentMethods[0].tokenizationSpecification.parameters).toEqual({ gateway: "stripe", "stripe:version": "existing-version", "stripe:publishableKey": "pk_live_existing" });
  });

  it.each([
    ["non-Stripe gateway", { type: "CARD", tokenizationSpecification: { type: "PAYMENT_GATEWAY", parameters: { gateway: "adyen" } } }],
    ["non-CARD method", { type: "TOKENIZED_CARD", tokenizationSpecification: { type: "PAYMENT_GATEWAY", parameters: { gateway: "stripe" } } }],
    ["non-payment-gateway tokenization", { type: "CARD", tokenizationSpecification: { type: "DIRECT", parameters: { gateway: "stripe" } } }],
  ])("leaves a %s request completely untouched", (_label, method) => {
    const request = { allowedPaymentMethods: [method], unrelated: { keep: true } };

    const corrected = prepareStripeGooglePayRequest(request, "pk_test_supplied");

    expect(corrected).toBe(request);
  });

  it.each([undefined, "", "   ", "sk_test_secret_key", "not_a_publishable_key"])("fails open without a valid publishable key (%s)", (publishableKey) => {
    const request = stripeGooglePayRequest();

    const corrected = prepareStripeGooglePayRequest(request, publishableKey);

    expect(corrected).toBe(request);
  });

  it("passes the corrected request to the original method and diagnostics while preserving call and promise identity", async () => {
    const request = stripeGooglePayRequest();
    const originalPromise = Promise.reject({ statusCode: "OR_BIBED_06" });
    let receivedThis: unknown;
    let receivedArguments: unknown[] = [];
    const original = vi.fn(function (this: unknown, ...args: unknown[]) {
      receivedThis = this;
      receivedArguments = args;
      return originalPromise;
    });
    const prototype = exposeGooglePay(original);
    const report = vi.fn();
    const stop = installGooglePayDiagnostics({ donationId: "corrected-diagnostic", report, stripePublishableKey: "pk_test_actual_value_must_not_be_reported" });
    const client = Object.create(prototype) as { loadPaymentData: LoadPaymentData };

    const returned = client.loadPaymentData(request, "preserved-second-argument");

    expect(returned).toBe(originalPromise);
    await expect(returned).rejects.toEqual({ statusCode: "OR_BIBED_06" });
    expect(original).toHaveBeenCalledOnce();
    expect(receivedThis).toBe(client);
    expect(receivedArguments[1]).toBe("preserved-second-argument");
    expect(receivedArguments[0]).not.toBe(request);
    expect(request.allowedPaymentMethods[0].tokenizationSpecification.parameters).toEqual({ gateway: "stripe" });

    const rejection = report.mock.calls.map(([event]) => event).find((event) => event.event_type === "load_payment_data_rejection");
    expect(rejection).toMatchObject({
      request_snapshot: {
        allowedPaymentMethods: [{
          tokenizationSpecification: {
            type: "PAYMENT_GATEWAY",
            parameters: {
              gateway: "stripe",
              "stripe:version": "2018-10-31",
              stripe_publishable_key_present: true,
              stripe_publishable_key_mode: "pk_test",
            },
          },
        }],
      },
    });
    expect(JSON.stringify(rejection)).not.toContain("pk_test_actual_value_must_not_be_reported");
    stop();
  });
});

describe("temporary Google Pay browser diagnostics", () => {
  it("forwards the exact receiver and arguments and returns the original promise identity", async () => {
    const request = { apiVersion: 2 };
    const expected = Promise.resolve({ token: "must remain private" });
    let receiver: unknown;
    let forwarded: unknown[] = [];
    const original = vi.fn(function (this: unknown, ...args: unknown[]) {
      receiver = this;
      forwarded = args;
      return expected;
    });
    const prototype = exposeGooglePay(original);
    const stop = installGooglePayDiagnostics({ donationId: "promise-identity", report: vi.fn() });
    const client = Object.create(prototype) as { loadPaymentData: LoadPaymentData };

    const returned = client.loadPaymentData(request, "second-argument");

    expect(returned).toBe(expected);
    expect(original).toHaveBeenCalledOnce();
    expect(receiver).toBe(client);
    expect(forwarded).toEqual([request, "second-argument"]);
    await expect(returned).resolves.toEqual({ token: "must remain private" });
    stop();
  });

  it("observes a rejection without handling or replacing the SDK's original rejection", async () => {
    const providerError = { name: "PaymentDataError", statusCode: "OR_BIBED_06", statusMessage: " blocked ", message: "wallet failed", stack: "private stack", token: "private" };
    const originalPromise = Promise.reject(providerError);
    const prototype = exposeGooglePay(() => originalPromise);
    const report = vi.fn();
    const stop = installGooglePayDiagnostics({ donationId: "rejection-observer", report });

    const returned = (Object.create(prototype) as { loadPaymentData: LoadPaymentData }).loadPaymentData({ apiVersion: 2 });

    expect(returned).toBe(originalPromise);
    await expect(returned).rejects.toBe(providerError);
    expect(report).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "load_payment_data_rejection",
      error: { name: "PaymentDataError", statusCode: "OR_BIBED_06", statusMessage: "blocked", message: "wallet failed" },
    }));
    expect(JSON.stringify(report.mock.calls)).not.toContain("private stack");
    expect(JSON.stringify(report.mock.calls)).not.toContain("private\"");
    stop();
  });

  it("swallows synchronous and asynchronous reporter failures only", async () => {
    const first = Promise.reject(new Error("provider rejection one"));
    const prototype = exposeGooglePay(() => first);
    const stop = installGooglePayDiagnostics({ donationId: "sync-reporter-failure", report: () => { throw new Error("reporter failed"); } });
    const returned = (Object.create(prototype) as { loadPaymentData: LoadPaymentData }).loadPaymentData({});
    await expect(returned).rejects.toThrow("provider rejection one");
    stop();

    const second = Promise.reject(new Error("provider rejection two"));
    const secondPrototype = exposeGooglePay(() => second);
    const stopSecond = installGooglePayDiagnostics({ donationId: "async-reporter-failure", report: () => Promise.reject(new Error("reporter failed")) });
    const returnedSecond = (Object.create(secondPrototype) as { loadPaymentData: LoadPaymentData }).loadPaymentData({});
    await expect(returnedSecond).rejects.toThrow("provider rejection two");
    stopSecond();
  });

  it("wraps once for multiple observers and restores only after the final cleanup", () => {
    const original = vi.fn(() => Promise.resolve({}));
    const prototype = exposeGooglePay(original);
    const stopFirst = installGooglePayDiagnostics({ donationId: "double-wrap-one", report: vi.fn() });
    const wrapper = prototype.loadPaymentData;
    const stopSecond = installGooglePayDiagnostics({ donationId: "double-wrap-two", report: vi.fn() });

    expect(prototype.loadPaymentData).toBe(wrapper);
    expect(prototype.loadPaymentData).not.toBe(original);
    stopFirst();
    expect(prototype.loadPaymentData).toBe(wrapper);
    stopSecond();
    expect(prototype.loadPaymentData).toBe(original);
  });

  it("does not overwrite a later third-party wrapper during cleanup", () => {
    const original = vi.fn(() => Promise.resolve({}));
    const prototype = exposeGooglePay(original);
    const stop = installGooglePayDiagnostics({ donationId: "cleanup-ownership", report: vi.fn() });
    const replacement = vi.fn(() => Promise.resolve({}));
    prototype.loadPaymentData = replacement;

    stop();

    expect(prototype.loadPaymentData).toBe(replacement);
  });

  it("waits for the SDK, reports installation once, and clears its timers", () => {
    vi.useFakeTimers();
    const report = vi.fn();
    const stop = installGooglePayDiagnostics({ donationId: "delayed-sdk", report });
    expect(report).not.toHaveBeenCalled();
    exposeGooglePay(() => Promise.resolve({}));

    vi.advanceTimersByTime(GOOGLE_PAY_HOOK_POLL_MS);

    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith({ event_type: "hook_installed" });
    expect(vi.getTimerCount()).toBe(0);
    stop();
  });

  it("reports hook unavailability exactly once after a bounded timeout and stops polling", () => {
    vi.useFakeTimers();
    const report = vi.fn();
    const stop = installGooglePayDiagnostics({ donationId: "unavailable-sdk", report });

    vi.advanceTimersByTime(GOOGLE_PAY_HOOK_TIMEOUT_MS * 3);

    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith({ event_type: "hook_unavailable" });
    expect(vi.getTimerCount()).toBe(0);
    stop();
  });

  it("passively observes visible gpayError messages without mutating or stopping them", () => {
    const report = vi.fn();
    const otherListener = vi.fn();
    window.addEventListener("message", otherListener);
    const stop = installGooglePayDiagnostics({ donationId: "message-observer", report });
    const data = { data: { gpayError: { statusCode: "OR_BIBED_06", message: " refused ", stack: "private" } }, untouched: true };
    const event = new MessageEvent("message", { data, cancelable: true });

    window.dispatchEvent(event);

    expect(otherListener).toHaveBeenCalledWith(event);
    expect(event.defaultPrevented).toBe(false);
    expect(data).toEqual({ data: { gpayError: { statusCode: "OR_BIBED_06", message: " refused ", stack: "private" } }, untouched: true });
    expect(report).toHaveBeenCalledWith({ event_type: "gpay_message_error", error: { statusCode: "OR_BIBED_06", message: "refused" } });
    stop();
    window.removeEventListener("message", otherListener);
  });

  it("allowlists, trims, and bounds error strings without recursive serialization", () => {
    const safe = sanitizeGooglePayError({
      name: `  ${"n".repeat(600)}  `,
      statusCode: " OR_BIBED_06 ",
      statusMessage: 123,
      message: " message ",
      stack: "private stack",
      cause: { message: "nested private message" },
    });

    expect(safe.name).toHaveLength(500);
    expect(safe).toEqual({ name: "n".repeat(500), statusCode: "OR_BIBED_06", message: "message" });
    expect(Object.keys(safe).sort()).toEqual(["message", "name", "statusCode"]);
  });

  it("captures only safe Google Pay request configuration and classifies the Stripe key", () => {
    const snapshot = sanitizeGooglePayRequest({
      apiVersion: 2,
      apiVersionMinor: 0,
      merchantInfo: { merchantId: "BCR2DN4TEST", merchantName: " MissionPay ", email: "private@example.com" },
      allowedPaymentMethods: [{
        type: "CARD",
        parameters: { allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"], allowedCardNetworks: ["VISA", "MASTERCARD"], billingAddressRequired: true },
        tokenizationSpecification: { type: "PAYMENT_GATEWAY", parameters: { gateway: "stripe", "stripe:version": "2018-10-31", "stripe:publishableKey": "pk_test_SUPER_SECRET" } },
        paymentMethodData: { tokenizationData: { token: "private-token", cryptogram: "private-cryptogram", pan: "4111111111111111", cvv: "123" } },
      }],
      emailRequired: true,
      client_secret: "private-client-secret",
      rawResponse: { arbitrary: "private-response" },
      transactionInfo: { totalPrice: "10.00" },
    });

    expect(snapshot).toEqual({
      apiVersion: 2,
      apiVersionMinor: 0,
      merchantInfo: { merchantIdPresent: true, merchantIdClassification: "bcr", merchantName: "MissionPay" },
      allowedPaymentMethods: [{
        type: "CARD",
        parameters: { allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"], allowedCardNetworks: ["VISA", "MASTERCARD"] },
        tokenizationSpecification: { type: "PAYMENT_GATEWAY", parameters: { gateway: "stripe", "stripe:version": "2018-10-31", stripe_publishable_key_present: true, stripe_publishable_key_mode: "pk_test" } },
      }],
    });
    const serialized = JSON.stringify(snapshot);
    for (const secret of ["SUPER_SECRET", "private-token", "private-cryptogram", "4111111111111111", "123", "private-client-secret", "private-response", "private@example.com", "10.00", "billingAddressRequired", "paymentMethodData", "tokenizationData"]) expect(serialized).not.toContain(secret);
  });

  it.each([
    ["pk_test_secret-value", "pk_test"],
    ["pk_live_secret-value", "pk_live"],
    ["public_value", "other"],
    [undefined, "missing"],
  ])("classifies a Stripe publishable key without retaining it (%s)", (publishableKey, mode) => {
    const snapshot = sanitizeGooglePayRequest({ allowedPaymentMethods: [{ type: "CARD", tokenizationSpecification: { parameters: { "stripe:publishableKey": publishableKey } } }] });
    expect(snapshot).toMatchObject({ allowedPaymentMethods: [{ tokenizationSpecification: { parameters: { stripe_publishable_key_mode: mode, stripe_publishable_key_present: publishableKey !== undefined } } }] });
    if (publishableKey) expect(JSON.stringify(snapshot)).not.toContain(publishableKey);
  });

  it.each([
    ["123456789", "numeric"],
    ["merchant-value", "other"],
    ["", "missing"],
  ])("classifies merchant IDs without retaining them (%s)", (merchantId, classification) => {
    const snapshot = sanitizeGooglePayRequest({ merchantInfo: { merchantId }, allowedPaymentMethods: [] });
    expect(snapshot.merchantInfo).toEqual({ merchantIdPresent: Boolean(merchantId), merchantIdClassification: classification });
    expect(JSON.stringify(snapshot)).not.toContain(merchantId || "a value that cannot occur");
  });
});

describe("backend-only diagnostic boundary", () => {
  it("accepts only the four diagnostic event types", () => {
    for (const event of ["hook_installed", "load_payment_data_rejection", "gpay_message_error", "hook_unavailable"]) {
      expect(isGooglePayDiagnosticEventType(event)).toBe(true);
    }
    for (const event of ["payment_token", "raw_response", "hook-installed", null]) {
      expect(isGooglePayDiagnosticEventType(event)).toBe(false);
    }
  });

  it("re-sanitizes browser error and request snapshots using the backend allowlist", () => {
    expect(sanitizeDiagnosticError({ name: " Error ", statusCode: "OR_BIBED_06", message: "m", stack: "private", token: "private" })).toEqual({
      error_name: "Error",
      error_status_code: "OR_BIBED_06",
      error_status_message: null,
      error_message: "m",
    });
    const request = sanitizeDiagnosticRequest({
      apiVersion: 2,
      merchantInfo: { merchantIdPresent: true, merchantIdClassification: "bcr", merchantId: "private" },
      allowedPaymentMethods: [{ type: "CARD", parameters: { allowedAuthMethods: ["PAN_ONLY"], pan: "4111111111111111" }, tokenizationSpecification: { type: "PAYMENT_GATEWAY", parameters: { gateway: "stripe", stripe_publishable_key_present: true, stripe_publishable_key_mode: "pk_live", "stripe:publishableKey": "private" } } }],
      paymentMethodData: { token: "private-token" },
    });
    expect(JSON.stringify(request)).not.toContain("4111111111111111");
    expect(JSON.stringify(request)).not.toContain("private");
    expect(request).toMatchObject({ merchantInfo: { merchantIdPresent: true, merchantIdClassification: "bcr" } });
  });

  it("authenticates with the hashed donation capability and never logs or stores the token", () => {
    expect(edgeSource).toContain("const tokenHash = await sha256(statusToken)");
    expect(edgeSource).toContain('.eq("access_token_hash", tokenHash)');
    expect(edgeSource).toContain('admin.rpc("insert_google_pay_diagnostic_event"');
    expect(edgeSource).not.toContain("console.");
    expect(migrationSource).not.toContain("status_token");
    expect(edgeSource).toContain('return json(request, { ok: true })');
  });

  it("uses a dedicated RLS table with no browser policy and an atomic ten-event cap", () => {
    expect(migrationSource).toContain("donation_id uuid not null references public.donations(id) on delete cascade");
    expect(migrationSource).toContain("alter table public.google_pay_diagnostic_events enable row level security");
    expect(migrationSource).toContain("revoke all on table public.google_pay_diagnostic_events from public, anon, authenticated");
    expect(migrationSource).not.toMatch(/create policy/i);
    expect(migrationSource).toContain("pg_advisory_xact_lock");
    expect(migrationSource).toContain(">= 10");
    expect(migrationSource).toContain("grant execute on function public.insert_google_pay_diagnostic_event");
  });

  it("documents custom capability auth and leaves all payment paths unchanged", () => {
    expect(configSource).toMatch(/\[functions\.google-pay-diagnostic\]\r?\nverify_jwt = false/);
    expect(edgeSource).toContain("verify_jwt is intentionally false");
    expect(checkoutSource).toContain('supabase.functions.invoke("google-pay-diagnostic"');
    expect(checkoutSource).toContain('hyper.confirmPayment({');
    expect(checkoutSource).toContain('wallets: { walletReturnUrl: statusUrl }');
  });
});
