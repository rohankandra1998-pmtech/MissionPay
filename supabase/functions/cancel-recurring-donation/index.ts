import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { sha256 } from "../_shared/crypto.ts";
import { adminClient } from "../_shared/database.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  try {
    const body = await request.json();
    const token = String(body.management_token ?? "");
    const action = String(body.action ?? "retrieve");
    if (token.length < 30) return json(request, { error: "Invalid management link." }, 401);
    const admin = adminClient();
    const tokenHash = await sha256(token);
    const { data: recurring } = await admin.from("recurring_donations").select("id, campaign_id, amount_cents, currency, status, started_at, next_charge_at, cancelled_at, campaign:campaigns(title, slug)").eq("management_token_hash", tokenHash).single();
    if (!recurring) return json(request, { error: "Invalid management link." }, 404);
    if (action === "cancel") {
      if (recurring.status !== "cancelled") await admin.from("recurring_donations").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", recurring.id);
      return json(request, { ok: true, status: "cancelled" });
    }
    if (action !== "retrieve") return json(request, { error: "Unsupported action." }, 400);
    const campaign = Array.isArray(recurring.campaign) ? recurring.campaign[0] : recurring.campaign;
    return json(request, { ...recurring, campaign });
  } catch (error) {
    console.error("cancel-recurring-donation failed", error instanceof Error ? error.message : "unknown error");
    return json(request, { error: "Monthly donation management is temporarily unavailable." }, 500);
  }
});
