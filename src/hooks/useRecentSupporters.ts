import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export interface SupporterActivity { id: string; display_name: string; amount_cents: number; frequency: string; created_at: string }

export function useRecentSupporters(campaignId?: string) {
  const [supporters, setSupporters] = useState<SupporterActivity[]>([]);
  useEffect(() => {
    if (!campaignId) return;
    const load = async () => {
      const { data } = await supabase.from("public_supporter_activity").select("id, display_name, amount_cents, frequency, created_at").eq("campaign_id", campaignId).order("created_at", { ascending: false }).limit(4);
      setSupporters((data ?? []) as SupporterActivity[]);
    };
    void load();
  }, [campaignId]);
  return supporters;
}
