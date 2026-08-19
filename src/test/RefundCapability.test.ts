import { describe, expect, it } from "vitest";
import { createManagementCapability, verifyManagementCapability } from "../../supabase/functions/_shared/managementCapability";
import { createRefundCapability, verifyRefundCapability } from "../../supabase/functions/_shared/refundCapability";

const secret = "test-only-refund-capability-secret-longer-than-32-characters";
const donationId = "10000000-0000-4000-8000-000000000321";
const recurringId = "10000000-0000-4000-8000-000000000654";

describe("refund request capabilities", () => {
  it("verifies a valid purpose-scoped token", async () => {
    const token = await createRefundCapability(donationId, secret);
    await expect(verifyRefundCapability(token, secret)).resolves.toEqual({ donationId });
  });

  it("rejects tampered and malformed tokens", async () => {
    const token = await createRefundCapability(donationId, secret);
    const [version, payload, signature] = token.split(".");
    await expect(verifyRefundCapability(`${version}.${payload}A.${signature}`, secret)).resolves.toBeNull();
    await expect(verifyRefundCapability("mp1.invalid.signature", secret)).resolves.toBeNull();
    await expect(verifyRefundCapability("x".repeat(1001), secret)).resolves.toBeNull();
  });

  it("cannot be exchanged with recurring-management capabilities", async () => {
    const refundToken = await createRefundCapability(donationId, secret);
    const managementToken = await createManagementCapability(recurringId, secret);
    await expect(verifyRefundCapability(managementToken, secret)).resolves.toBeNull();
    await expect(verifyManagementCapability(refundToken, secret)).resolves.toBeNull();
  });
});
