const defaultOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];

export function corsHeaders(request: Request) {
  const configured = (Deno.env.get("APP_URL") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const origin = request.headers.get("origin") ?? "";
  const allowed = [...configured, ...defaultOrigins];
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0] ?? "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(request), "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
