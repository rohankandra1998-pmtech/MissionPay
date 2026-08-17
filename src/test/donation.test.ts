import { describe, expect, it } from "vitest";
import { mapHyperswitchStatus, nextMonthlyCharge, validateDonationAmount } from "../lib/donation";
import { progressPercent } from "../lib/format";

describe("donation rules", () => {
  it("enforces amount boundaries", () => {
    expect(validateDonationAmount(99)).toContain("minimum");
    expect(validateDonationAmount(100)).toBeNull();
    expect(validateDonationAmount(1_000_001)).toContain("maximum");
  });

  it("maps provider states into business states", () => {
    expect(mapHyperswitchStatus("succeeded")).toBe("succeeded");
    expect(mapHyperswitchStatus("failed")).toBe("failed");
    expect(mapHyperswitchStatus("requires_customer_action")).toBe("processing");
  });

  it("uses an end-of-month-safe recurring date", () => {
    expect(nextMonthlyCharge(new Date("2026-01-31T12:00:00Z")).toISOString()).toBe("2026-02-28T12:00:00.000Z");
  });

  it("caps progress at one hundred percent", () => {
    expect(progressPercent(21_000, 20_000)).toBe(100);
  });
});
