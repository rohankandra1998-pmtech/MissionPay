import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DonationStatusPage } from "../pages/DonationStatusPage";
import type { PaymentFailureReason } from "../types/domain";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("../lib/supabase", () => ({ supabase: { functions: { invoke } } }));
vi.mock("../lib/analytics", () => ({ track: vi.fn() }));

function response(reason?: PaymentFailureReason, status = "failed") {
  return {
    id: "donation-1",
    campaign_id: "campaign-1",
    amount_cents: 5000,
    currency: "USD",
    frequency: "one_time",
    is_anonymous: false,
    status,
    hyperswitch_payment_id: "payment-1",
    recurring_donation_id: null,
    created_at: "2026-08-17T00:00:00Z",
    completed_at: null as string | null,
    campaign: { title: "Community support campaign", slug: "community-support" },
    ...(reason ? { failure: { reason } } : {}),
  };
}

function renderStatus(payload: ReturnType<typeof response>) {
  invoke.mockResolvedValue({ data: payload, error: null });
  return render(<MemoryRouter initialEntries={["/donations/donation-1/status"]}><Routes><Route path="/donations/:donationId/status" element={<DonationStatusPage />} /></Routes></MemoryRouter>);
}

describe("reason-aware donation status", () => {
  beforeEach(() => {
    invoke.mockReset();
    sessionStorage.setItem("missionpay:donation:donation-1", "a-secure-status-token-that-is-long-enough");
  });
  afterEach(() => { cleanup(); sessionStorage.clear(); });

  it.each([
    ["insufficient_funds", "There aren't enough funds on this card.", "Try another payment method"],
    ["card_declined", "Your card was declined.", "Try another payment method"],
    ["card_unavailable", "This card can't be used for this payment.", "Try another payment method"],
    ["authentication_failed", "We couldn't verify this payment with your bank.", "Try again"],
    ["invalid_cvv", "The card security code wasn't accepted.", "Try again"],
    ["expired_card", "This card has expired.", "Try another payment method"],
    ["invalid_card", "The card details weren't accepted.", "Try again"],
    ["payment_cancelled", "Payment cancelled.", "Try again"],
    ["session_expired", "Your payment session expired.", "Restart payment"],
    ["technical_error", "We couldn't process this payment right now.", "Try again"],
  ] satisfies [PaymentFailureReason, string, string][]) ("shows safe guidance for %s", async (reason, headline, action) => {
    renderStatus(response(reason));

    expect(await screen.findByRole("heading", { name: headline })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: new RegExp(action) })).toHaveAttribute("href", "/donate/campaign-1");
    expect(screen.getByText(/campaign total/i)).toBeInTheDocument();
  });

  it("falls back safely when no normalized reason is available", async () => {
    renderStatus(response());
    expect(await screen.findByRole("heading", { name: "Your donation was not charged." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Try again/ })).toHaveAttribute("href", "/donate/campaign-1");
  });

  it("preserves the processing state", async () => {
    renderStatus(response(undefined, "processing"));
    expect(await screen.findByRole("heading", { name: "We’re confirming your donation." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Check again/ })).toBeInTheDocument();
  });

  it("preserves the success confirmation", async () => {
    renderStatus({ ...response(undefined, "succeeded"), completed_at: "2026-08-17T00:01:00Z" });
    expect(await screen.findByRole("heading", { name: "Thank you for showing up." })).toBeInTheDocument();
    expect(screen.getByText("$50")).toBeInTheDocument();
  });
});
