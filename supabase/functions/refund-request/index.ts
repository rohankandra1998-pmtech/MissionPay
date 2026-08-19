import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/database.ts";
import { retrieveRefund } from "../_shared/hyperswitch.ts";
import { verifyRefundCapability } from "../_shared/refundCapability.ts";
import { reconcileRefund } from "../_shared/reconcileRefund.ts";
import { isRefundRequestReason, refundEligibility, refundRequestSubmissionDecision, validateRefundDetails } from "../_shared/refunds.ts";

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

async function loadState(admin: ReturnType<typeof adminClient>, donationId: string) {
  const { data: donation, error } = await admin.from("donations")
    .select("id, amount_cents, currency, frequency, status, hyperswitch_payment_id, created_at, completed_at, campaign:campaigns(title, slug)")
    .eq("id", donationId)
    .maybeSingle();
  if (error) throw error;
  if (!donation) return null;
  const { data: refundRequest, error: requestError } = await admin.from("refund_requests")
    .select("id, reason, details, status, decision_note, created_at, reviewed_at")
    .eq("donation_id", donationId)
    .maybeSingle();
  if (requestError) throw requestError;
  const { data: refund, error: refundError } = await admin.from("refunds")
    .select("id, hyperswitch_refund_id, status, provider_updated_at, completed_at")
    .eq("donation_id", donationId)
    .maybeSingle();
  if (refundError) throw refundError;
  return { donation, refundRequest, refund };
}

function safeView(state: NonNullable<Awaited<ReturnType<typeof loadState>>>) {
  const campaign = one(state.donation.campaign);
  return {
    donation: {
      id: state.donation.id,
      amount_cents: state.donation.amount_cents,
      currency: state.donation.currency,
      frequency: state.donation.frequency,
      status: state.donation.status,
      created_at: state.donation.created_at,
      completed_at: state.donation.completed_at,
      campaign,
    },
    eligibility: refundEligibility(state.donation),
    refund_request: state.refundRequest,
    refund: state.refund ? {
      status: state.refund.status,
      provider_updated_at: state.refund.provider_updated_at,
      completed_at: state.refund.completed_at,
    } : null,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 4_000) return json(request, { error: "Request is too large." }, 413);
    const body = await request.json() as Record<string, unknown>;
    const token = String(body.capability ?? "");
    const secret = Deno.env.get("DONATION_MANAGEMENT_LINK_SECRET") ?? "";
    const capability = await verifyRefundCapability(token, secret);
    if (!capability) return json(request, { error: "This refund request link is invalid." }, 404);

    const admin = adminClient();
    let state = await loadState(admin, capability.donationId);
    if (!state) return json(request, { error: "This refund request link is invalid." }, 404);
    if (body.action === "submit") {
      const decision = refundRequestSubmissionDecision(state.donation, state.refundRequest);
      if (decision === "existing") return json(request, safeView(state));
      if (decision === "ineligible") return json(request, safeView(state), 409);
      if (!isRefundRequestReason(body.reason)) return json(request, { error: "Choose a valid refund reason." }, 400);
      const detailsResult = validateRefundDetails(body.reason, body.details);
      if ("error" in detailsResult) return json(request, { error: detailsResult.error }, 400);
      const { error: insertError } = await admin.from("refund_requests").insert({
        donation_id: capability.donationId,
        reason: body.reason,
        details: detailsResult.details,
      });
      if (insertError && insertError.code !== "23505") throw insertError;
      state = await loadState(admin, capability.donationId);
      if (!state) throw new Error("refund_request_state_unavailable");
      return json(request, safeView(state), insertError?.code === "23505" ? 200 : 201);
    }
    if (body.action !== "preview") return json(request, { error: "Unsupported action." }, 400);

    if (state.refund && ["initiating", "pending", "review"].includes(state.refund.status)) {
      try {
        const providerRefund = await retrieveRefund(state.refund.hyperswitch_refund_id);
        await reconcileRefund(admin, providerRefund as unknown as Record<string, unknown>);
        state = await loadState(admin, capability.donationId) ?? state;
      } catch {
        // The persisted state remains authoritative until a later webhook or sync succeeds.
      }
    }
    return json(request, safeView(state));
  } catch (error) {
    console.error("refund-request failed", error instanceof Error ? error.message : "unknown error");
    return json(request, { error: "Refund request details are temporarily unavailable." }, 500);
  }
});
