import { describe, expect, it } from "vitest";
import { normalizeCampaign } from "../hooks/useCampaigns";

describe("campaign normalization", () => {
  it("uses zero-valued metrics when a campaign has no metrics row", () => {
    const campaign = normalizeCampaign({
      id: "campaign-1",
      fundraiser: { display_name: "Fundraiser" },
      metrics: null,
    });

    expect(campaign.metrics).toEqual({
      raised_amount_cents: 0,
      supporter_count: 0,
      successful_donation_count: 0,
      active_recurring_count: 0,
      average_donation_cents: 0,
    });
  });
});
