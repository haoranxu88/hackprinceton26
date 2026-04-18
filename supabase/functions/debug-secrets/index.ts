
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const geminiKey = Deno.env.get("GEMINI_API_KEY");

  const result: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    GEMINI_API_KEY: geminiKey ? `${geminiKey.slice(0, 12)}...${geminiKey.slice(-4)} (${geminiKey.length} chars)` : "NOT SET",
  };

  if (geminiKey) {
    try {
      console.log("[debug] Testing Gemini with key:", geminiKey.slice(0, 12) + "...");
      const resp = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": geminiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Reply with exactly: OK" }] }],
            generationConfig: { maxOutputTokens: 10 },
          }),
        }
      );
      const text = await resp.text();
      result.gemini_status = resp.status;
      result.gemini_ok = resp.ok;
      result.gemini_response = text.slice(0, 500);
      console.log("[debug] Gemini status:", resp.status, "body:", text.slice(0, 200));
    } catch (e) {
      result.gemini_error = e.message;
      console.error("[debug] Gemini fetch error:", e.message);
    }
  }

  return new Response(JSON.stringify(result, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
