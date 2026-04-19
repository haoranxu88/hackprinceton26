export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Build a JSON response with CORS headers applied. */
export function corsJson(body: unknown, init: ResponseInit = {}): Response {
  const headers = { ...corsHeaders, "Content-Type": "application/json", ...(init.headers ?? {}) };
  return new Response(JSON.stringify(body), { ...init, headers });
}

/** Short-circuit preflight; returns null if not an OPTIONS request. */
export function handlePreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return null;
}
