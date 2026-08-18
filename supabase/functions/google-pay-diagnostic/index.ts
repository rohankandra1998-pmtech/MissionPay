import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { sha256 } from "../_shared/crypto.ts";
import { adminClient } from "../_shared/database.ts";
import { isGooglePayDiagnosticEventType, sanitizeDiagnosticError, sanitizeDiagnosticRequest } from "../_shared/googlePayDiagnostic.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// verify_jwt is intentionally false: this endpoint authenticates the donation's
// opaque status capability after hashing it with the same helper as payment-status.
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Invalid request." }, 405);
  try {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > 12_000) return json(request, { error: "Invalid request." }, 400);
    const body = await request.json() as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body) || JSON.stringify(body).length > 12_000) return json(request, { error: "Invalid request." }, 400);
    const donationId = typeof body.donation_id === "string" ? body.donation_id : "";
    const statusToken = typeof body.status_token === "string" ? body.status_token : "";
    const eventType = body.event_type;
    if (!uuidPattern.test(donationId) || statusToken.length < 30 || statusToken.length > 500 || !isGooglePayDiagnosticEventType(eventType)) {
      return json(request, { error: "Invalid request." }, 401);
    }

    const admin = adminClient();
    const tokenHash = await sha256(statusToken);
    const { data: donation } = await admin.from("donations").select("id").eq("id", donationId).eq("access_token_hash", tokenHash).maybeSingle();
    if (!donation) return json(request, { error: "Invalid request." }, 401);

    const error = sanitizeDiagnosticError(body.error);
    const requestSnapshot = sanitizeDiagnosticRequest(body.request_snapshot);
    const { error: insertError } = await admin.rpc("insert_google_pay_diagnostic_event", {
      p_donation_id: donationId,
      p_event_type: eventType,
      p_error_name: error.error_name,
      p_error_status_code: error.error_status_code,
      p_error_status_message: error.error_status_message,
      p_error_message: error.error_message,
      p_request_snapshot: Object.keys(requestSnapshot).length ? requestSnapshot : null,
    });
    if (insertError) throw insertError;
    return json(request, { ok: true });
  } catch {
    return json(request, { error: "Invalid request." }, 400);
  }
});
