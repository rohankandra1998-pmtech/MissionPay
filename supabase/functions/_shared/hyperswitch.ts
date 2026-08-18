import { deriveMissionPayStatus, sanitizePaymentFailureDiagnostic } from "./paymentFailure.ts";

const baseUrl = () => Deno.env.get("HYPERSWITCH_BASE_URL") ?? "https://sandbox.hyperswitch.io";
const apiKey = () => {
  const value = Deno.env.get("HYPERSWITCH_API_KEY");
  if (!value) throw new Error("Hyperswitch API key is not configured");
  return value;
};

async function request(path: string, init: RequestInit) {
  const response = await fetch(`${baseUrl()}${path}`, { ...init, headers: { "Content-Type": "application/json", Accept: "application/json", "api-key": apiKey(), ...(init.headers ?? {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    // Provider messages can contain issuer or risk details. Keep them out of logs by
    // making the throwable message generic; callers only need the machine code/status.
    const error = new Error("Hyperswitch request failed") as Error & { code?: string; status?: number };
    error.code = payload?.error?.code;
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function createCustomer(input: { customerId: string; name: string; email: string }) {
  return request("/customers", { method: "POST", body: JSON.stringify({ customer_id: input.customerId, name: input.name, email: input.email, description: "MissionPay donor" }) });
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
