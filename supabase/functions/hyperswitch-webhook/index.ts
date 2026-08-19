import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { constantTimeEqual, hmacSha512, sha256 } from "../_shared/crypto.ts";
import { adminClient } from "../_shared/database.ts";
import { reconcilePayment } from "../_shared/reconcile.ts";
import { reconcileRefund } from "../_shared/reconcileRefund.ts";
import { isDuplicateProviderEvent, shouldResumeDuplicateProviderEvent } from "../_shared/providerEvents.ts";
import { sanitizedRefundEventPayload } from "../_shared/refunds.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = Deno.env.get("HYPERSWITCH_WEBHOOK_SECRET");
  if (!secret) return new Response("Webhook verification is not configured", { status: 503 });
  const rawBody = await request.text();
  const receivedSignature = request.headers.get("x-webhook-signature-512")?.trim().toLowerCase() ?? "";
  const expectedSignature = await hmacSha512(rawBody, secret);
  if (!receivedSignature || !constantTimeEqual(receivedSignature, expectedSignature)) return new Response("Invalid signature", { status: 401 });
  try {
    const event = JSON.parse(rawBody);
    const eventId = String(event.event_id ?? await sha256(rawBody));
    const eventType = String(event.type ?? "unknown");
    const object = event.content?.object ?? event.data?.object ?? event.object ?? event.content ?? {};
    const refundEvent = eventType.startsWith("refund_") || event.content?.type === "refund_details";
    const paymentId = refundEvent ? "" : String(object.payment_id ?? object.id ?? "");
    const providerRefundId = refundEvent ? String(object.refund_id ?? "") : "";
    const admin = adminClient();
    const { data: attempt } = paymentId ? await admin.from("payment_attempts").select("id").eq("hyperswitch_payment_id", paymentId).maybeSingle() : { data: null };
    const { data: refund } = providerRefundId ? await admin.from("refunds").select("id").eq("hyperswitch_refund_id", providerRefundId).maybeSingle() : { data: null };
    let { data: inserted, error: insertError } = await admin.from("payment_events").insert({
      provider_event_id: eventId,
      event_type: eventType,
      payment_attempt_id: attempt?.id ?? null,
      refund_id: refund?.id ?? null,
      payload: refundEvent ? sanitizedRefundEventPayload(event, object) : event,
      provider_updated_at: object.updated_at ?? object.updated ?? null,
    }).select("id").maybeSingle();
    if (isDuplicateProviderEvent(insertError)) {
      const { data: existingEvent, error: existingError } = await admin.from("payment_events")
        .select("id, processed_at")
        .eq("provider_event_id", eventId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existingEvent || !shouldResumeDuplicateProviderEvent(existingEvent.processed_at)) return new Response("Already processed", { status: 200 });
      inserted = existingEvent;
      insertError = null;
    }
    if (insertError) throw insertError;
    if (refundEvent && providerRefundId && refund) await reconcileRefund(admin, { ...object, refund_id: providerRefundId });
    else if (!refundEvent && paymentId && attempt) await reconcilePayment(admin, { ...object, payment_id: paymentId });
    if (inserted) await admin.from("payment_events").update({ processed_at: new Date().toISOString() }).eq("id", inserted.id);
    return new Response("Accepted", { status: 200 });
  } catch (error) {
    console.error("hyperswitch-webhook failed", error instanceof Error ? error.message : "unknown error");
    return new Response("Webhook processing failed", { status: 500 });
  }
});
