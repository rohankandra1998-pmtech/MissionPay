import { afterEach, describe, expect, it, vi } from "vitest";
import createPaymentSource from "../../supabase/functions/create-payment/index.ts?raw";
import { ensureCustomer, HyperswitchError, hyperswitchErrorDiagnostic, retrieveCustomer } from "../../supabase/functions/_shared/hyperswitch";

const input = { customerId: "cus_mp_1b277e3ae23a45afb473919c2ac4a97f", name: "Avery Donor", email: "avery@example.com" };
const customer = { customer_id: input.customerId, name: input.name };
const missing = () => new HyperswitchError("provider", "HE_02", 404);
const duplicate = () => new HyperswitchError("provider", "IR_12", 400);

describe("Hyperswitch customer lifecycle", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("creates a stable customer after the exact documented not-found response", async () => {
    const retrieve = vi.fn().mockRejectedValue(missing());
    const create = vi.fn().mockResolvedValue(customer);

    await expect(ensureCustomer(input, { retrieve, create })).resolves.toEqual(customer);
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(input);
  });

  it("reuses a returning donor customer without creating it again", async () => {
    const retrieve = vi.fn().mockResolvedValue(customer);
    const create = vi.fn();

    await expect(ensureCustomer(input, { retrieve, create })).resolves.toEqual(customer);
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("closes a concurrent create race by retrieving after the exact duplicate response", async () => {
    const retrieve = vi.fn().mockRejectedValueOnce(missing()).mockResolvedValueOnce(customer);
    const create = vi.fn().mockRejectedValue(duplicate());

    await expect(ensureCustomer(input, { retrieve, create })).resolves.toEqual(customer);
    expect(retrieve).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("does not turn authentication or provider failures into customer creation", async () => {
    const providerError = new HyperswitchError("provider", "HE_01", 401);
    const retrieve = vi.fn().mockRejectedValue(providerError);
    const create = vi.fn();

    await expect(ensureCustomer(input, { retrieve, create })).rejects.toBe(providerError);
    expect(create).not.toHaveBeenCalled();
  });

  it("propagates a genuine create failure without a broad duplicate fallback", async () => {
    const providerError = new HyperswitchError("provider", "HE_00", 500);
    const retrieve = vi.fn().mockRejectedValue(missing());
    const create = vi.fn().mockRejectedValue(providerError);

    await expect(ensureCustomer(input, { retrieve, create })).rejects.toBe(providerError);
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("keeps customer identity independent from campaign and recurring-plan lifetime", async () => {
    const retrieve = vi.fn().mockResolvedValue(customer);
    const create = vi.fn();

    await ensureCustomer(input, { retrieve, create });
    await ensureCustomer(input, { retrieve, create });
    expect(retrieve).toHaveBeenCalledTimes(2);
    expect(retrieve).toHaveBeenNthCalledWith(1, input.customerId);
    expect(retrieve).toHaveBeenNthCalledWith(2, input.customerId);
    expect(create).not.toHaveBeenCalled();
  });

  it("keeps diagnostics machine-readable without provider prose or donor data", () => {
    expect(hyperswitchErrorDiagnostic(duplicate())).toEqual({ provider: "hyperswitch", kind: "provider", code: "IR_12", status: 400 });
    expect(JSON.stringify(hyperswitchErrorDiagnostic(duplicate()))).not.toMatch(/Avery|avery@example|customer_id/);
  });

  it("retrieves the stable customer through the official v1 endpoint", async () => {
    vi.stubGlobal("Deno", { env: { get: (key: string) => key === "HYPERSWITCH_API_KEY" ? "test-api-key" : undefined } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(customer), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(retrieveCustomer(input.customerId)).resolves.toEqual(customer);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`https://sandbox.hyperswitch.io/customers/${input.customerId}`);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "GET" });
  });

  it("keeps provider prose out of thrown retrieve errors while retaining HE_02", async () => {
    vi.stubGlobal("Deno", { env: { get: (key: string) => key === "HYPERSWITCH_API_KEY" ? "test-api-key" : undefined } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: "HE_02", message: "Customer details and private provider prose" },
    }), { status: 404 })));

    const error = await retrieveCustomer(input.customerId).catch((caught) => caught);
    expect(error).toBeInstanceOf(HyperswitchError);
    expect(hyperswitchErrorDiagnostic(error)).toEqual({ provider: "hyperswitch", kind: "provider", code: "HE_02", status: 404 });
    expect(String(error)).not.toMatch(/Customer details|private provider prose/);
  });

  it("ensures customers only for monthly checkout and before recurring/payment records", () => {
    const ensureIndex = createPaymentSource.indexOf("await ensureCustomer");
    expect(createPaymentSource).toContain('if (body.frequency === "monthly")');
    expect(createPaymentSource).toContain('customer_id: body.frequency === "monthly" ? customerId : undefined');
    expect(ensureIndex).toBeGreaterThan(createPaymentSource.indexOf('if (body.frequency === "monthly")'));
    expect(ensureIndex).toBeLessThan(createPaymentSource.indexOf('from("recurring_donations").insert'));
    expect(ensureIndex).toBeLessThan(createPaymentSource.indexOf("await createPayment"));
  });
});
