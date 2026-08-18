import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DonatePage } from "../pages/DonatePage";
import type { Campaign } from "../types/domain";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("../lib/supabase", () => ({
  supabase: { functions: { invoke }, from: vi.fn() },
}));

vi.mock("../features/payments/HyperswitchCheckout", () => ({
  HyperswitchCheckout: ({ clientSecret }: { clientSecret: string }) => <div>Payment element: {clientSecret}</div>,
}));

const campaign: Campaign = {
  id: "campaign-1", fundraiser_id: "fundraiser-1", slug: "campaign-one", title: "Community support campaign",
  short_description: "A clear description of the community support campaign.", story: "Story", category: "Community",
  goal_amount_cents: 100_000, currency: "USD", cover_image_url: "https://images.example/cover.jpg", impact_statement: "Impact",
  status: "published", end_date: null, published_at: "2026-08-17T00:00:00Z", created_at: "2026-08-17T00:00:00Z",
  fundraiser: { display_name: "Organizer", organization_name: null, avatar_url: null, verification_status: "verified" },
  metrics: { raised_amount_cents: 0, supporter_count: 0, successful_donation_count: 0, active_recurring_count: 0, average_donation_cents: 0 },
};

function renderDonation() {
  return render(<MemoryRouter initialEntries={[{ pathname: "/donate/campaign-1", state: { campaign } }]}><Routes><Route path="/donate/:campaignId" element={<DonatePage />} /></Routes></MemoryRouter>);
}

async function continueToPayment() {
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Donor Name" } });
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "donor@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: /Review \$50 donation/ }));
  fireEvent.click(await screen.findByRole("button", { name: /Continue to secure payment/ }));
}

describe("donation payment initialization", () => {
  beforeEach(() => invoke.mockReset());
  afterEach(cleanup);

  it("displays a safe Edge Function error body for a non-2xx response", async () => {
    const safeMessage = "We could not verify this campaign right now. No charge was made. Please try again.";
    invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(new Response(JSON.stringify({ error: safeMessage }), { status: 500, headers: { "Content-Type": "application/json" } })) });
    renderDonation();
    await continueToPayment();

    expect(await screen.findByRole("alert")).toHaveTextContent(safeMessage);
  });

  it("uses the generic donor-safe fallback when no structured response is available", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("private infrastructure detail") });
    renderDonation();
    await continueToPayment();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We could not open secure checkout. No charge was made. Please try again.");
    expect(alert).not.toHaveTextContent("private infrastructure detail");
  });

  it("continues to the official checkout step for a valid payment session", async () => {
    invoke.mockResolvedValue({ data: { donation_id: "donation-1", payment_id: "payment-1", client_secret: "client-secret", status_token: "status-token" }, error: null });
    renderDonation();
    await continueToPayment();

    await waitFor(() => expect(screen.getByText("Payment element: client-secret")).toBeInTheDocument());
  });
});
