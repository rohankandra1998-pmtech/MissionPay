import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, userClient } from "../_shared/database.ts";
import { createRefund, hyperswitchErrorDiagnostic, retrieveRefund } from "../_shared/hyperswitch.ts";
import { reconcileRefund } from "../_shared/reconcileRefund.ts";
import { authorizePlatformAdmin } from "../_shared/platformAdmin.ts";
import { buildLocalRefundIdentity, buildRefundPayload, providerRefundId } from "../_shared/refunds.ts";

const requestSelection = "id, donation_id, reason, details, status, reviewed_by, reviewed_at, decision_note, created_at, donation:donations(id, amount_cents, currency, frequency, status, hyperswitch_payment_id, created_at, donor:donors(name, email), campaign:campaigns(title, slug)), refund:refunds(id, hyperswitch_refund_id, status, provider_updated_at, error_code, completed_at, execution_claimed_at)";

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

async function platformAdmin(request: Request) {
  const client = userClient(request);
  const admin = adminClient();
  const authorization = await authorizePlatformAdmin(
    async () => (await client.auth.getUser()).data.user?.id ?? null,
    async (userId) => {
      const { data, error } = await admin.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
  );
  if (!authorization.ok) return { error: authorization.reason };
  return { user: { id: authorization.userId }, admin };
}

async function getRequest(admin: ReturnType<typeof adminClient>, id: string) {
  const { data, error } = await admin.from("refund_requests").select(requestSelection).eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

async function listRequests(admin: ReturnType<typeof adminClient>, status?: string) {
  let query = admin.from("refund_requests").select(requestSelection).order("created_at", { ascending: false }).limit(100);
  if (["pending", "approved", "declined"].includes(status ?? "")) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 4_000) return json(request, { error: "Request is too large." }, 413);
    const auth = await platformAdmin(request);
    if ("error" in auth) return json(request, { error: auth.error === "unauthenticated" ? "Authentication required." : "Platform admin access required." }, auth.error === "unauthenticated" ? 401 : 403);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action ?? "list");
    if (action === "list") return json(request, { requests: await listRequests(auth.admin, typeof body.status === "string" ? body.status : undefined) });

    const requestId = String(body.refund_request_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) return json(request, { error: "Invalid refund request." }, 400);
    let refundRequest = await getRequest(auth.admin, requestId);
    if (!refundRequest) return json(request, { error: "Refund request not found." }, 404);
    const donation = one(refundRequest.donation);
    const existingRefund = one(refundRequest.refund);

    if (action === "sync") {
      if (existingRefund && ["initiating", "pending", "review"].includes(existingRefund.status)) {
        try {
          const provider = await retrieveRefund(existingRefund.hyperswitch_refund_id);
          await reconcileRefund(auth.admin, provider as unknown as Record<string, unknown>);
        } catch {
          // Keep the local state; a verified webhook or later retry can reconcile it.
        }
      }
      return json(request, { request: await getRequest(auth.admin, requestId) });
    }

    const note = typeof body.decision_note === "string" ? body.decision_note.trim() : "";
    if (note.length > 500) return json(request, { error: "Decision note must be 500 characters or fewer." }, 400);
    if (action === "decline") {
      if (refundRequest.status !== "pending") return json(request, { error: "This request has already been reviewed.", request: refundRequest }, 409);
      const reviewedAt = new Date().toISOString();
      const { data: declined, error } = await auth.admin.from("refund_requests").update({
        status: "declined", reviewed_by: auth.user.id, reviewed_at: reviewedAt, decision_note: note || null,
      }).eq("id", requestId).eq("status", "pending").select(requestSelection).maybeSingle();
      if (error) throw error;
      if (!declined) return json(request, { error: "This request was reviewed by another admin.", request: await getRequest(auth.admin, requestId) }, 409);
      return json(request, { request: declined });
    }
    if (action !== "approve") return json(request, { error: "Unsupported action." }, 400);
    if (!donation?.hyperswitch_payment_id || donation.status !== "succeeded") {
      if (donation?.status === "refunded" && existingRefund?.status === "succeeded") return json(request, { request: refundRequest });
      return json(request, { error: "The donation is no longer eligible for a refund." }, 409);
    }
    if (refundRequest.status === "declined") return json(request, { error: "A declined request cannot be approved." }, 409);
    if (refundRequest.status === "pending") {
      const reviewedAt = new Date().toISOString();
      const { data: approved, error } = await auth.admin.from("refund_requests").update({
        status: "approved", reviewed_by: auth.user.id, reviewed_at: reviewedAt, decision_note: note || null,
      }).eq("id", requestId).eq("status", "pending").select(requestSelection).maybeSingle();
      if (error) throw error;
      refundRequest = approved ?? await getRequest(auth.admin, requestId);
      if (!refundRequest || refundRequest.status !== "approved") return json(request, { error: "This request was reviewed by another admin.", request: refundRequest }, 409);
    }

    const providerId = providerRefundId(requestId);
    const refundIdentity = buildLocalRefundIdentity({
      donationId: donation.id,
      refundRequestId: requestId,
      paymentId: donation.hyperswitch_payment_id,
      amountCents: Number(donation.amount_cents),
      currency: donation.currency,
      reason: refundRequest.reason,
    });
    const { error: insertError } = await auth.admin.from("refunds").insert(refundIdentity);
    if (insertError && insertError.code !== "23505") throw insertError;
    const { data: currentRefund, error: refundError } = await auth.admin.from("refunds").select("*").eq("refund_request_id", requestId).single();
    if (refundError || !currentRefund) throw refundError ?? new Error("refund_identity_unavailable");
    if (currentRefund.hyperswitch_refund_id !== providerId || currentRefund.donation_id !== donation.id) throw new Error("refund_identity_conflict");

    if (["succeeded", "failed", "pending", "review"].includes(currentRefund.status)) {
      if (["pending", "review"].includes(currentRefund.status)) {
        try {
          const provider = await retrieveRefund(providerId);
          await reconcileRefund(auth.admin, provider as unknown as Record<string, unknown>);
        } catch { /* webhook or later sync will retry */ }
      }
      return json(request, { request: await getRequest(auth.admin, requestId) });
    }

    const claimTime = new Date().toISOString();
    let claimQuery = auth.admin.from("refunds").update({ execution_claimed_at: claimTime }).eq("id", currentRefund.id).eq("status", "initiating");
    claimQuery = currentRefund.execution_claimed_at
      ? claimQuery.eq("execution_claimed_at", currentRefund.execution_claimed_at)
      : claimQuery.is("execution_claimed_at", null);
    if (currentRefund.execution_claimed_at && Date.now() - new Date(currentRefund.execution_claimed_at).getTime() < 120_000) {
      return json(request, { request: await getRequest(auth.admin, requestId) }, 202);
    }
    const { data: claimed, error: claimError } = await claimQuery.select("id").maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return json(request, { request: await getRequest(auth.admin, requestId) }, 202);

    try {
      const payload = buildRefundPayload({
        donationId: donation.id,
        refundRequestId: requestId,
        paymentId: donation.hyperswitch_payment_id,
        amountCents: Number(donation.amount_cents),
        reason: refundRequest.reason,
      });
      const provider = await createRefund(payload);
      await reconcileRefund(auth.admin, provider as unknown as Record<string, unknown>);
      return json(request, { request: await getRequest(auth.admin, requestId) });
    } catch (error) {
      const diagnostic = hyperswitchErrorDiagnostic(error);
      await auth.admin.from("refunds").update({ execution_claimed_at: null, error_code: diagnostic.code.slice(0, 120) }).eq("id", currentRefund.id).eq("execution_claimed_at", claimTime);
      console.error("Hyperswitch refund execution deferred", { refund_request_id: requestId, diagnostic });
      return json(request, { error: "Hyperswitch has not confirmed the refund yet. The same refund identity can be retried safely.", request: await getRequest(auth.admin, requestId) }, 502);
    }
  } catch (error) {
    console.error("review-refund-request failed", error instanceof Error ? error.message : "unknown error");
    return json(request, { error: "Refund review is temporarily unavailable." }, 500);
  }
});
