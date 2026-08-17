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
    const error = new Error(payload?.error?.message ?? payload?.message ?? `Hyperswitch returned ${response.status}`) as Error & { code?: string; status?: number };
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

export function retrievePayment(paymentId: string, forceSync = false) {
  return request(`/payments/${encodeURIComponent(paymentId)}${forceSync ? "?force_sync=true" : ""}`, { method: "GET" });
}

export function missionPayStatus(providerStatus: string) {
  if (["succeeded", "captured", "partially_captured"].includes(providerStatus)) return "succeeded";
  if (["failed", "authentication_failed", "router_declined"].includes(providerStatus)) return "failed";
  if (["cancelled", "voided"].includes(providerStatus)) return "cancelled";
  return "processing";
}

export function nextMonthlyDate(from: Date, anchorDay: number) {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();
  return new Date(Date.UTC(year, month + 1, Math.min(anchorDay, lastDay), from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds()));
}
