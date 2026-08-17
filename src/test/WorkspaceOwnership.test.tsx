import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CampaignEditorPage } from "../pages/CampaignEditorPage";
import { DashboardPage } from "../pages/DashboardPage";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1", email: "owner@example.com" } }),
}));

vi.mock("../lib/supabase", () => ({
  supabase: { from, functions: { invoke: vi.fn() } },
}));

function query(data: unknown, singleData: unknown = data) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "order", "limit", "update", "insert"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn().mockResolvedValue({ data: singleData, error: null });
  builder.single = vi.fn().mockResolvedValue({ data: singleData, error: null });
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve, reject);
  return builder as Record<string, ReturnType<typeof vi.fn>> & PromiseLike<{ data: unknown; error: null }>;
}

const seededTitles = ["Clean Water for Rural Communities", "Rebuild the Library After the Storm", "Care and Recovery for Elena"];
const ownedCampaign = {
  id: "owned-1", fundraiser_id: "fundraiser-1", slug: "owned-campaign", title: "My Community Campaign",
  short_description: "A fundraiser-owned campaign for the local community.", story: "A".repeat(120), category: "Community",
  goal_amount_cents: 10000, currency: "USD", cover_image_url: "https://images.example/owned.jpg", impact_statement: "Direct local impact for neighbors.",
  status: "published", end_date: null, published_at: "2026-08-01T00:00:00Z", created_at: "2026-08-01T00:00:00Z",
  fundraiser: { display_name: "Owner", organization_name: null, avatar_url: null, verification_status: "verified" },
  metrics: { raised_amount_cents: 2500, supporter_count: 1, successful_donation_count: 1, active_recurring_count: 2, average_donation_cents: 2500 },
};

function arrangeDashboard(campaigns: unknown[], donations: unknown[] = [], recurring: unknown[] = []) {
  const builders = {
    fundraisers: query(null, { id: "fundraiser-1" }), campaigns: query(campaigns), donations: query(donations), recurring_donations: query(recurring),
  };
  from.mockImplementation((table: keyof typeof builders) => builders[table]);
  return builders;
}

describe("fundraiser workspace ownership", () => {
  afterEach(cleanup);
  beforeEach(() => from.mockReset());

  it("shows zero totals and no seeded campaigns for a new fundraiser", async () => {
    const builders = arrangeDashboard([]);
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);

    expect(await screen.findByText("Create your first campaign")).toBeInTheDocument();
    expect(screen.getByText("$0 combined goal")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
    for (const title of seededTitles) expect(screen.queryByText(title)).not.toBeInTheDocument();
    expect(builders.campaigns.eq).toHaveBeenCalledWith("fundraiser_id", "fundraiser-1");
    expect(from).not.toHaveBeenCalledWith("donations");
  });

  it("derives dashboard metrics only from owned campaigns", async () => {
    const donation = { id: "donation-1", campaign_id: "owned-1", amount_cents: 2500, currency: "USD", frequency: "one_time", is_anonymous: false, status: "succeeded", hyperswitch_payment_id: null, recurring_donation_id: null, created_at: "2026-08-02T00:00:00Z", completed_at: "2026-08-02T00:00:00Z", donor: { name: "Donor", email: "donor@example.com" }, campaign: { title: ownedCampaign.title, slug: ownedCampaign.slug } };
    const builders = arrangeDashboard([ownedCampaign], [donation]);
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);

    expect(await screen.findByText(ownedCampaign.title, { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("$100 combined goal")).toBeInTheDocument();
    expect(screen.getAllByText("$25").length).toBeGreaterThan(0);
    expect(screen.getByText("2", { selector: "strong" })).toBeInTheDocument();
    for (const title of seededTitles) expect(screen.queryByText(title)).not.toBeInTheDocument();
    expect(builders.donations.in).toHaveBeenCalledWith("campaign_id", ["owned-1"]);
    expect(builders.recurring_donations.in).toHaveBeenCalledWith("campaign_id", ["owned-1"]);
  });

  it("lists only the authenticated fundraiser's campaigns", async () => {
    arrangeDashboard([ownedCampaign]);
    render(<MemoryRouter><DashboardPage section="campaigns" /></MemoryRouter>);

    expect(await screen.findByText(ownedCampaign.title)).toBeInTheDocument();
    for (const title of seededTitles) expect(screen.queryByText(title)).not.toBeInTheDocument();
  });
});

function renderEditor() {
  return render(<MemoryRouter initialEntries={["/dashboard/campaigns/campaign-1"]}><Routes><Route path="/dashboard/campaigns/:id" element={<CampaignEditorPage />} /></Routes></MemoryRouter>);
}

describe("campaign editor ownership", () => {
  afterEach(cleanup);
  beforeEach(() => from.mockReset());

  it("scopes fundraiser and campaign lookup to the authenticated owner", async () => {
    const fundraiser = query(null, { id: "fundraiser-1" });
    const campaign = query(null, { ...ownedCampaign, id: "campaign-1" });
    from.mockImplementation((table: string) => table === "fundraisers" ? fundraiser : campaign);
    renderEditor();

    expect(await screen.findByDisplayValue(ownedCampaign.title)).toBeInTheDocument();
    expect(fundraiser.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(campaign.eq).toHaveBeenCalledWith("id", "campaign-1");
    expect(campaign.eq).toHaveBeenCalledWith("fundraiser_id", "fundraiser-1");
  });

  it("does not expose a campaign that the fundraiser does not own", async () => {
    const fundraiser = query(null, { id: "fundraiser-1" });
    const campaign = query(null, null);
    from.mockImplementation((table: string) => table === "fundraisers" ? fundraiser : campaign);
    renderEditor();

    expect(await screen.findByRole("alert")).toHaveTextContent("Campaign not found or you do not have access to edit it.");
    expect(screen.getByLabelText("Campaign title")).toHaveValue("");
    expect(screen.queryByDisplayValue(ownedCampaign.title)).not.toBeInTheDocument();
  });
});
