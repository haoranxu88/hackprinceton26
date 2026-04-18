
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// === AI PROVIDER CONFIG ===
// Set to "gemini" to switch back once you have a Gemini subscription
const AI_PROVIDER = "enter";
// ==========================

async function callEnterAI(prompt: string): Promise<string> {
  const token = Deno.env.get("AI_API_TOKEN_f11936aa39dd");
  if (!token) throw new Error("AI_API_TOKEN not configured");

  console.log("[analyze] Using Enter AI (Claude Sonnet 4.5)");
  const response = await fetch("https://api.enter.pro/code/api/v1/ai/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-4.5",
      messages: [{ role: "user", content: prompt }],
      stream: false,
      max_tokens: 4096,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("[analyze] Enter AI error:", response.status, errText.slice(0, 300));
    throw new Error(`Enter AI returned ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error("Empty response from Enter AI");
  return text;
}

async function callGemini(prompt: string): Promise<string> {
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) throw new Error("GEMINI_API_KEY not configured");

  console.log("[analyze] Using Gemini 2.0 Flash");
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

  for (let attempt = 1; attempt <= 3; attempt++) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
      }),
    });

    if (resp.status === 429 && attempt < 3) {
      console.log(`[analyze] Gemini 429, retry ${attempt}/3...`);
      await new Promise(r => setTimeout(r, attempt * 5000));
      continue;
    }

    const text = await resp.text();
    if (!resp.ok) throw new Error(`Gemini ${resp.status}: ${text.slice(0, 200)}`);

    const data = JSON.parse(text);
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error("Empty Gemini response");
    return content;
  }
  throw new Error("Gemini max retries exceeded");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { products } = await req.json();
    if (!products?.length) {
      return new Response(JSON.stringify({ error: "No products provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[analyze] === START === ${products.length} products, provider: ${AI_PROVIDER}`);

    const productList = products
      .map((p: { name: string; description: string }, i: number) =>
        `${i + 1}. "${p.name}" - ${p.description || "No description"}`)
      .join("\n");

    const prompt = `You are an EPA toxicology expert. Analyze these consumer products for hazardous chemicals.

Products:
${productList}

Return ONLY valid JSON (no markdown, no code fences, no explanation):
{"overallScore":<0-100>,"percentile":<number>,"riskLevel":"<safe|moderate|high|critical>","totalProductsScanned":${products.length},"flaggedProducts":<number>,"chemicals":[{"chemical":"<name>","casNumber":"<CAS>","category":"<carcinogen|endocrine_disruptor|irritant|neurotoxin>","exposureRoute":"<dermal|inhalation|ingestion>","concentrationPpm":<number>,"kp":<number>,"contactTimeHrs":<number>,"frequency":<number>,"riskLevel":"<safe|moderate|high|critical>","products":["<product names>"],"healthEffects":["<effects>"]}]}

Focus on benzene, formaldehyde, talc, parabens, phthalates, PFAS, oxybenzone, aluminum.`;

    const rawText = AI_PROVIDER === "enter"
      ? await callEnterAI(prompt)
      : await callGemini(prompt);

    console.log("[analyze] Raw response length:", rawText.length);
    const cleanJson = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const analysis = JSON.parse(cleanJson);
    console.log("[analyze] === SUCCESS === Score:", analysis.overallScore);

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[analyze] === CRASH ===", error.message);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
