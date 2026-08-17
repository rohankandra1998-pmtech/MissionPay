import type { DonationStatus } from "../types/domain";

export const MIN_DONATION_CENTS = 100;
export const MAX_DONATION_CENTS = 1_000_000;

export function validateDonationAmount(cents: number) {
  if (!Number.isInteger(cents)) return "Enter a valid whole-cent amount.";
  if (cents < MIN_DONATION_CENTS) return "The minimum donation is $1.";
  if (cents > MAX_DONATION_CENTS) return "The maximum donation is $10,000.";
  return null;
}

export function mapHyperswitchStatus(status: string): DonationStatus {
  if (["succeeded", "captured", "partially_captured"].includes(status)) return "succeeded";
  if (["failed", "authentication_failed", "router_declined"].includes(status)) return "failed";
  if (["cancelled", "voided"].includes(status)) return "cancelled";
  return "processing";
}

export function nextMonthlyCharge(from: Date) {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth();
  const day = from.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();
  return new Date(Date.UTC(year, month + 1, Math.min(day, lastDay), from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds()));
}
