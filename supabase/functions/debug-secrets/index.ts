
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const knotClientId = Deno.env.get("KNOT_CLIENT_ID");
  const knotSecret = Deno.env.get("KNOT_SECRET");

  const result: Record<string, unknown> = {
    GEMINI_API_KEY: geminiKey ? `${geminiKey.slice(0, 8)}...${geminiKey.slice(-4)} (${geminiKey.length} chars)` : "NOT SET",
    KNOT_CLIENT_ID: knotClientId ? `${knotClientId.slice(0, 8)}...${knotClientId.slice(-4)} (${knotClientId.length} chars)` : "NOT SET",
    KNOT_SECRET: knotSecret ? `${knotSecret.slice(0, 8)}...${knotSecret.slice(-4)} (${knotSecret.length} chars)` : "NOT SET",
  };

  if (geminiKey) {
    try {
      const resp = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": geminiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Say hello in 3 words" }] }],
          }),
        }
      );
      const text = await resp.text();
      result.gemini_status = resp.status;
      result.gemini_response = text.slice(0, 500);
    } catch (e) {
      result.gemini_error = e.message;
    }
  }

  return new Response(JSON.stringify(result, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
