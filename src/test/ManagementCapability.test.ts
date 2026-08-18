import { describe, expect, it, vi } from "vitest";
import { hmacSha256, sha256 } from "../../supabase/functions/_shared/crypto";
import {
  cancelManagementPlan,
  createManagementCapability,
  resolveManagementPlan,
  verifyManagementCapability,
  type ManagementPlanStore,
} from "../../supabase/functions/_shared/managementCapability";

const secret = "test-only-management-secret-with-more-than-32-characters";
const recurringId = "10000000-0000-4000-8000-000000000123";

function encode(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function signedToken(version: string, payload: Record<string, unknown>) {
  const encodedPayload = encode(new TextEncoder().encode(JSON.stringify(payload)));
  const signedValue = `${version}.${encodedPayload}`;
  return `${signedValue}.${encode(await hmacSha256(signedValue, secret))}`;
}

describe("recurring management capabilities", () => {
  it("accepts a valid signed capability", async () => {
    const token = await createManagementCapability(recurringId, secret);
    await expect(verifyManagementCapability(token, secret)).resolves.toEqual({ recurringDonationId: recurringId });
  });

  it("rejects tampered payloads, signatures, and malformed tokens", async () => {
    const token = await createManagementCapability(recurringId, secret);
    const [version, payload, signature] = token.split(".");
    await expect(verifyManagementCapability(`${version}.${payload}A.${signature}`, secret)).resolves.toBeNull();
    const changedLastCharacter = signature.endsWith("A") ? "B" : "A";
    await expect(verifyManagementCapability(`${version}.${payload}.${signature.slice(0, -1)}${changedLastCharacter}`, secret)).resolves.toBeNull();
    await expect(verifyManagementCapability("not-a-capability", secret)).resolves.toBeNull();
  });

  it("rejects unsupported versions and wrong purposes even with valid signatures", async () => {
    await expect(verifyManagementCapability(await signedToken("mp2", { v: 1, p: "manage_recurring_donation", rid: recurringId }), secret)).resolves.toBeNull();
    await expect(verifyManagementCapability(await signedToken("mp1", { v: 1, p: "view_campaign", rid: recurringId }), secret)).resolves.toBeNull();
  });

  it("does not return data for a valid capability naming a nonexistent plan", async () => {
    const store = makeStore(null);
    await expect(resolveManagementPlan(await createManagementCapability(recurringId, secret), secret, store)).resolves.toBeNull();
    expect(store.findById).toHaveBeenCalledWith(recurringId);
  });

  it("retrieves an active plan only after verifying the signed capability", async () => {
    const plan = { id: recurringId, status: "active", cancelled_at: null };
    const store = makeStore(plan);
    await expect(resolveManagementPlan(await createManagementCapability(recurringId, secret), secret, store)).resolves.toEqual(plan);
    expect(store.findById).toHaveBeenCalledOnce();
    expect(store.findByLegacyHash).not.toHaveBeenCalled();
  });

  it("retains support for existing opaque management tokens", async () => {
    const plan = { id: recurringId, status: "active", cancelled_at: null };
    const store = makeStore(plan);
    const legacyToken = "legacy_opaque_management_token_1234567890";
    await expect(resolveManagementPlan(legacyToken, secret, store)).resolves.toEqual(plan);
    expect(store.findByLegacyHash).toHaveBeenCalledWith(await sha256(legacyToken));
  });
});

describe("recurring cancellation", () => {
  it("cancels once, sets cancelled_at, and leaves historical donations untouched", async () => {
    const donations = [{ id: "donation-1", status: "succeeded" }, { id: "donation-2", status: "succeeded" }];
    const plan = { id: recurringId, status: "active", cancelled_at: null };
    const store = makeStore(plan);
    const cancelledAt = "2026-08-18T01:00:00.000Z";
    await expect(cancelManagementPlan(plan, store, cancelledAt)).resolves.toMatchObject({ status: "cancelled", cancelled_at: cancelledAt });
    expect(store.cancel).toHaveBeenCalledWith(recurringId, cancelledAt);
    expect(donations).toEqual([{ id: "donation-1", status: "succeeded" }, { id: "donation-2", status: "succeeded" }]);
  });

  it("is idempotent for an already-cancelled plan", async () => {
    const plan = { id: recurringId, status: "cancelled", cancelled_at: "2026-08-18T01:00:00.000Z" };
    const store = makeStore(plan);
    await cancelManagementPlan(plan, store, "2026-08-18T02:00:00.000Z");
    expect(store.cancel).not.toHaveBeenCalled();
  });

  it("never invokes cancellation for an invalid token", async () => {
    const store = makeStore({ id: recurringId, status: "active", cancelled_at: null });
    const plan = await resolveManagementPlan("mp1.invalid.signature", secret, store);
    expect(plan).toBeNull();
    expect(store.cancel).not.toHaveBeenCalled();
  });
});

function makeStore(plan: { id: string; status: string; cancelled_at: string | null } | null): ManagementPlanStore<NonNullable<typeof plan>> {
  return {
    findById: vi.fn().mockResolvedValue(plan),
    findByLegacyHash: vi.fn().mockResolvedValue(plan),
    cancel: vi.fn().mockResolvedValue(undefined),
  };
}
