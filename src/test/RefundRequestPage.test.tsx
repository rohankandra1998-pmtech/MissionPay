import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RefundRequestPage } from "../pages/RefundRequestPage";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("../lib/supabase", () => ({ supabase: { functions: { invoke } } }));

const eligible = {
  donation: { id: "donation-1", amount_cents: 5000, currency: "USD", frequency: "one_time", status: "succeeded", created_at: "2026-08-18T00:00:00Z", completed_at: "2026-08-18T00:01:00Z", campaign: { title: "Community support campaign", slug: "community-support" } },
  eligibility: "eligible",
  refund_request: null,
  refund: null,
};

function renderPage() {
  return render(<MemoryRouter initialEntries={["/refund-request/mp1.refund.signature"]}><Routes><Route path="/refund-request/:token" element={<RefundRequestPage />} /></Routes></MemoryRouter>);
}

describe("donor refund request page", () => {
  beforeEach(() => invoke.mockReset());
  afterEach(cleanup);

  it("explains that submission starts review rather than issuing money", async () => {
    invoke.mockResolvedValue({ data: eligible, error: null });
    renderPage();
    expect(await screen.findByRole("heading", { name: "Request a full refund" })).toBeInTheDocument();
    expect(screen.getByText(/does not issue money automatically/i)).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("refund-request", { body: { action: "preview", capability: "mp1.refund.signature" } });
  });

  it("submits one request and shows pending admin review", async () => {
    invoke.mockResolvedValueOnce({ data: eligible, error: null }).mockResolvedValueOnce({ data: { ...eligible, refund_request: { id: "request-1", reason: "duplicate", details: "Duplicate", status: "pending", decision_note: null, created_at: "2026-08-19T00:00:00Z", reviewed_at: null } }, error: null });
    renderPage();
    await screen.findByRole("heading", { name: "Request a full refund" });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "duplicate" } });
    fireEvent.change(screen.getByLabelText(/Short explanation/), { target: { value: "Duplicate" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit refund request" }));
    expect(await screen.findByRole("heading", { name: "Refund request submitted" })).toBeInTheDocument();
    await waitFor(() => expect(invoke).toHaveBeenLastCalledWith("refund-request", { body: { action: "submit", capability: "mp1.refund.signature", reason: "duplicate", details: "Duplicate" } }));
  });

  it("keeps a monthly charge refund separate from recurring cancellation", async () => {
    invoke.mockResolvedValue({ data: { ...eligible, donation: { ...eligible.donation, frequency: "monthly" } }, error: null });
    renderPage();
    expect(await screen.findByText("This request is for one completed charge.")).toBeInTheDocument();
    expect(screen.getByText(/does not cancel your monthly donation/i)).toBeInTheDocument();
  });

  it("does not expose donation context for an invalid capability", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("invalid") });
    renderPage();
    expect(await screen.findByRole("heading", { name: /can’t open this refund request/i })).toBeInTheDocument();
    expect(screen.queryByText("Community support campaign")).not.toBeInTheDocument();
  });
});
