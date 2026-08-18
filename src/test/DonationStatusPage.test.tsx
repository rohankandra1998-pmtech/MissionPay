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

function renderStatus(payload: ReturnType<typeof response> & Record<string, unknown>) {
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
    ["lost_card", "This card has been reported lost.", "Try another payment method"],
    ["stolen_card", "This card has been reported stolen.", "Try another payment method"],
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

  it.each([
    ["lost_card", "This card has been reported lost.", /reported stolen/i],
    ["stolen_card", "This card has been reported stolen.", /reported lost/i],
  ] as const)("shows only the specific issuer status for %s", async (reason, headline, excludedCopy) => {
    renderStatus(response(reason));

    expect(await screen.findByRole("heading", { name: headline })).toBeInTheDocument();
    expect(screen.queryByText(excludedCopy)).toBeNull();
  });

  it("keeps ambiguous unavailable-card failures generic", async () => {
    renderStatus(response("card_unavailable"));

    expect(await screen.findByRole("heading", { name: "This card can't be used for this payment." })).toBeInTheDocument();
    expect(screen.queryByText(/reported lost/i)).toBeNull();
    expect(screen.queryByText(/reported stolen/i)).toBeNull();
  });

  it("falls back safely when no normalized reason is available", async () => {
    renderStatus(response());
    expect(await screen.findByRole("heading", { name: "Your payment couldn't be completed." })).toBeInTheDocument();
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

  it("shows active monthly status only when reusable payment setup is ready", async () => {
    sessionStorage.setItem("missionpay:management:donation-1", "secure-management-token");
    renderStatus({
      ...response(undefined, "succeeded"),
      frequency: "monthly",
      completed_at: "2026-08-17T00:01:00Z",
      recurring_status: "active",
      recurring_payment_method_ready: true,
      next_charge_at: "2026-09-17T12:00:00Z",
    });
    expect(await screen.findByText("Monthly donation active")).toBeInTheDocument();
    expect(screen.getByText("Sep 17, 2026")).toBeInTheDocument();
  });

  it("confirms the donation without claiming future charges when recurring setup is incomplete", async () => {
    sessionStorage.setItem("missionpay:management:donation-1", "secure-management-token");
    renderStatus({
      ...response(undefined, "succeeded"),
      frequency: "monthly",
      completed_at: "2026-08-17T00:01:00Z",
      recurring_status: "past_due",
      recurring_payment_method_ready: false,
    });
    expect(await screen.findByRole("heading", { name: "Thank you for showing up." })).toBeInTheDocument();
    expect(screen.getByText("Future monthly donations were not activated")).toBeInTheDocument();
    expect(screen.queryByText("Monthly donation active")).not.toBeInTheDocument();
    expect(screen.queryByText(/Next donation/)).not.toBeInTheDocument();
  });
});
