import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ManageDonationPage } from "../pages/ManageDonationPage";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("../lib/supabase", () => ({ supabase: { functions: { invoke } } }));
vi.mock("../lib/analytics", () => ({ track: vi.fn() }));

const activePlan = {
  id: "10000000-0000-4000-8000-000000000123",
  campaign_id: "campaign-1",
  amount_cents: 2500,
  currency: "USD",
  is_anonymous: false,
  status: "active",
  started_at: "2026-08-17T08:00:00.000Z",
  next_charge_at: "2026-09-17T08:00:00.000Z",
  cancelled_at: null,
  campaign: { title: "Clean Water", slug: "clean-water" },
};

function renderPage() {
  return render(<MemoryRouter initialEntries={["/manage-donation/mp1.payload.signature"]}><Routes><Route path="/manage-donation/:token" element={<ManageDonationPage />} /></Routes></MemoryRouter>);
}

describe("monthly donation cancellation UI", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValueOnce({ data: activePlan, error: null });
  });
  afterEach(cleanup);

  it("requires explicit confirmation and choosing No performs no cancellation", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel monthly donation" }));
    expect(screen.getByRole("alertdialog", { name: "Cancel your monthly donation?" })).toBeInTheDocument();
    const keep = screen.getByRole("button", { name: "No, keep my monthly donation" });
    expect(keep).toHaveFocus();
    fireEvent.click(keep);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("calls cancellation only after Yes and renders the success state", async () => {
    invoke.mockResolvedValueOnce({ data: { ok: true, status: "cancelled" }, error: null });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel monthly donation" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel monthly donation" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(invoke.mock.calls[1][1]).toEqual({ body: { management_token: "mp1.payload.signature", action: "cancel" } });
    expect(await screen.findByText("Your monthly donation is cancelled.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel monthly donation" })).not.toBeInTheDocument();
  });

  it("does not use window.confirm", async () => {
    const confirm = vi.spyOn(window, "confirm");
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel monthly donation" }));
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});
