export function normalizeProviderReference(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function hasRecurringChargeCredentials(plan: {
  hyperswitch_customer_id?: unknown;
  hyperswitch_payment_method_reference?: unknown;
}) {
  return Boolean(
    normalizeProviderReference(plan.hyperswitch_customer_id)
    && normalizeProviderReference(plan.hyperswitch_payment_method_reference),
  );
}

export function initialRecurringSetupUpdate(customerId: unknown, methodId: unknown, nextChargeAt: string) {
  const customer = normalizeProviderReference(customerId);
  const method = normalizeProviderReference(methodId);
  if (!customer || !method) {
    return { status: "past_due" as const, hyperswitch_payment_method_reference: method };
  }
  return {
    status: "active" as const,
    hyperswitch_payment_method_reference: method,
    next_charge_at: nextChargeAt,
  };
}

export async function resolvePaymentMethodId(
  providerPayment: Record<string, unknown>,
  paymentId: string,
  retrieve: (id: string, forceSync: boolean) => Promise<Record<string, unknown>>,
) {
  const direct = normalizeProviderReference(providerPayment.payment_method_id);
  if (direct) return direct;
  const retrieved = await retrieve(paymentId, true);
  return normalizeProviderReference(retrieved.payment_method_id);
}
