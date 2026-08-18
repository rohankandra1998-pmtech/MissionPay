import { deriveMissionPayStatus, sanitizePaymentFailureDiagnostic } from "./paymentFailure.ts";

declare const Deno: { env: { get(name: string): string | undefined } };

const baseUrl = () => Deno.env.get("HYPERSWITCH_BASE_URL") ?? "https://sandbox.hyperswitch.io";

type HyperswitchErrorKind = "configuration" | "network" | "provider" | "invalid_response";

export class HyperswitchError extends Error {
  constructor(
    public readonly kind: HyperswitchErrorKind,
    public readonly code?: string,
    public readonly status?: number,
  ) {
    super("Hyperswitch request failed");
    this.name = "HyperswitchError";
  }
}

const apiKey = () => {
  const value = Deno.env.get("HYPERSWITCH_API_KEY");
  if (!value) throw new HyperswitchError("configuration");
  return value;
};

async function request(path: string, init: RequestInit) {
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, { ...init, headers: { "Content-Type": "application/json", Accept: "application/json", "api-key": apiKey(), ...(init.headers ?? {}) } });
  } catch (error) {
    if (error instanceof HyperswitchError) throw error;
    throw new HyperswitchError("network");
  }
  let payload: Record<string, unknown>;
  try {
    payload = await response.json();
  } catch {
    if (response.ok) throw new HyperswitchError("invalid_response", undefined, response.status);
    payload = {};
  }
  if (!response.ok || payload?.error) {
    // Provider messages can contain issuer or risk details. Keep them out of logs by
    // making the throwable message generic; callers only need the machine code/status.
    const providerError = typeof payload.error === "object" && payload.error !== null
      ? payload.error as Record<string, unknown>
      : payload;
    const code = typeof providerError.code === "string"
      ? providerError.code
      : typeof providerError.error_code === "string" ? providerError.error_code : undefined;
    throw new HyperswitchError("provider", code, response.status);
  }
  return payload;
}

export function createCustomer(input: { customerId: string; name: string; email: string }) {
  return request("/customers", { method: "POST", body: JSON.stringify({ customer_id: input.customerId, name: input.name, email: input.email, description: "MissionPay donor" }) });
}

export function retrieveCustomer(customerId: string) {
  return request(`/customers/${encodeURIComponent(customerId)}`, { method: "GET" });
}

type CustomerOperations = {
  retrieve: (customerId: string) => Promise<Record<string, unknown>>;
  create: (input: { customerId: string; name: string; email: string }) => Promise<Record<string, unknown>>;
};

const isProviderError = (error: unknown, status: number, code: string) =>
  error instanceof HyperswitchError && error.kind === "provider" && error.status === status && error.code === code;

export async function ensureCustomer(
  input: { customerId: string; name: string; email: string },
  operations: CustomerOperations = { retrieve: retrieveCustomer, create: createCustomer },
) {
  try {
    return await operations.retrieve(input.customerId);
  } catch (error) {
    // Hyperswitch's v1 customer API documents this exact not-found response.
    if (!isProviderError(error, 404, "HE_02")) throw error;
  }

  try {
    // Current docs say duplicate create can return the existing customer directly.
    return await operations.create(input);
  } catch (error) {
    // Current server error mapping can instead return this exact duplicate response.
    // A second retrieve closes the GET-miss/POST-create race without swallowing other errors.
    if (!isProviderError(error, 400, "IR_12")) throw error;
    return await operations.retrieve(input.customerId);
  }
}

export function hyperswitchErrorDiagnostic(error: unknown) {
  return error instanceof HyperswitchError
    ? { provider: "hyperswitch", kind: error.kind, code: error.code ?? "unknown", status: error.status ?? null }
    : { provider: "hyperswitch", kind: "internal", code: "unknown", status: null };
}

export function createPayment(input: Record<string, unknown>) {
  return request("/payments", { method: "POST", body: JSON.stringify(input) });
}

export async function retrievePayment(paymentId: string, forceSync = false) {
  const query = new URLSearchParams({ expand_attempts: "true" });
  if (forceSync) query.set("force_sync", "true");
  const payment = await request(`/payments/${encodeURIComponent(paymentId)}?${query.toString()}`, { method: "GET" });
  const diagnosticsEnabled = Deno.env.get("HYPERSWITCH_FAILURE_DIAGNOSTICS") === "true"
    && new URL(baseUrl()).hostname === "sandbox.hyperswitch.io";
  if (diagnosticsEnabled && ["failed", "cancelled"].includes(deriveMissionPayStatus(payment))) {
    console.info("Hyperswitch sandbox failure diagnostic", JSON.stringify(sanitizePaymentFailureDiagnostic(payment)));
  }
  return payment;
}

export function nextMonthlyDate(from: Date, anchorDay: number) {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();
  return new Date(Date.UTC(year, month + 1, Math.min(anchorDay, lastDay), from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds()));
}
