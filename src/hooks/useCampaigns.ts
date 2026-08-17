import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Campaign } from "../types/domain";

function normalizeCampaign(row: Record<string, unknown>): Campaign {
  const fundraiser = Array.isArray(row.fundraiser) ? row.fundraiser[0] : row.fundraiser;
  const metrics = Array.isArray(row.metrics) ? row.metrics[0] : row.metrics;
  return { ...row, fundraiser, metrics } as unknown as Campaign;
}

export function useCampaigns(limit?: number) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      let query = supabase
        .from("campaigns")
        .select("*, fundraiser:fundraisers(display_name, organization_name, avatar_url, verification_status), metrics:campaign_metrics(raised_amount_cents, supporter_count, successful_donation_count, active_recurring_count, average_donation_cents)")
        .eq("status", "published")
        .order("published_at", { ascending: false });
      if (limit) query = query.limit(limit);
      const { data, error: queryError } = await query;
      if (!alive) return;
      if (queryError) setError("Campaigns are taking longer than expected to load. Please try again.");
      else setCampaigns((data ?? []).map((row) => normalizeCampaign(row as Record<string, unknown>)));
      setLoading(false);
    };
    void load();
    return () => { alive = false; };
  }, [limit]);

  return { campaigns, loading, error };
}

export async function getCampaign(slug: string) {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*, fundraiser:fundraisers(display_name, organization_name, avatar_url, verification_status), metrics:campaign_metrics(raised_amount_cents, supporter_count, successful_donation_count, active_recurring_count, average_donation_cents)")
    .eq("slug", slug)
    .eq("status", "published")
    .single();
  if (error) throw error;
  return normalizeCampaign(data as Record<string, unknown>);
}
