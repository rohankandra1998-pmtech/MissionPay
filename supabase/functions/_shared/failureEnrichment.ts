import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.3";

const CLAIM_LEASE_MS = 2 * 60 * 1000;

export async function claimFailureEnrichment(admin: SupabaseClient, attemptId: string, now = new Date()) {
  const claimedAt = now.toISOString();
  const staleBefore = new Date(now.getTime() - CLAIM_LEASE_MS).toISOString();
  const { data, error } = await admin.from("payment_attempts")
    .update({ failure_enrichment_claimed_at: claimedAt })
    .eq("id", attemptId)
    .is("failure_enrichment_attempted_at", null)
    .or(`failure_enrichment_claimed_at.is.null,failure_enrichment_claimed_at.lt.${staleBefore}`)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data ? claimedAt : null;
}

export async function completeFailureEnrichment(admin: SupabaseClient, attemptId: string, claimedAt: string, now = new Date()) {
  const { error } = await admin.from("payment_attempts")
    .update({ failure_enrichment_attempted_at: now.toISOString(), failure_enrichment_claimed_at: null })
    .eq("id", attemptId)
    .eq("failure_enrichment_claimed_at", claimedAt);
  if (error) throw error;
}

export async function releaseFailureEnrichment(admin: SupabaseClient, attemptId: string, claimedAt: string) {
  const { error } = await admin.from("payment_attempts")
    .update({ failure_enrichment_claimed_at: null })
    .eq("id", attemptId)
    .eq("failure_enrichment_claimed_at", claimedAt);
  if (error) throw error;
}
