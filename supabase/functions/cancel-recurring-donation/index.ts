import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/database.ts";
import { cancelManagementPlan, resolveManagementPlan, type ManagementPlanStore } from "../_shared/managementCapability.ts";

const planSelection = "id, campaign_id, amount_cents, currency, status, started_at, next_charge_at, cancelled_at, campaign:campaigns(title, slug)";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  try {
    const body = await request.json();
    const token = String(body.management_token ?? "");
    const action = String(body.action ?? "retrieve");
    const admin = adminClient();
    type RecurringPlan = { id: string; status: string; cancelled_at: string | null; [key: string]: unknown };
    const findPlan = async (column: "id" | "management_token_hash", value: string) => {
      const { data, error } = await admin.from("recurring_donations").select(planSelection).eq(column, value).maybeSingle();
      if (error) throw error;
      return data as RecurringPlan | null;
    };
    const store: ManagementPlanStore<RecurringPlan> = {
      findById: (id) => findPlan("id", id),
      findByLegacyHash: (hash) => findPlan("management_token_hash", hash),
      cancel: async (id, cancelledAt) => {
        const { error } = await admin.from("recurring_donations").update({ status: "cancelled", cancelled_at: cancelledAt }).eq("id", id).neq("status", "cancelled");
        if (error) throw error;
      },
    };
    const recurring = await resolveManagementPlan(token, Deno.env.get("DONATION_MANAGEMENT_LINK_SECRET") ?? "", store);
    if (!recurring) return json(request, { error: "Invalid management link." }, 404);
    if (action === "cancel") {
      await cancelManagementPlan(recurring, store, new Date().toISOString());
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
