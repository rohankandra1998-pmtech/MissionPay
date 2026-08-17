import { createClient } from "npm:@supabase/supabase-js@2.112.3";

export function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secret) throw new Error("Supabase server credentials are not configured");
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function userClient(request: Request) {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  return createClient(url, key, { global: { headers: { Authorization: request.headers.get("Authorization") ?? "" } }, auth: { persistSession: false, autoRefreshToken: false } });
}
