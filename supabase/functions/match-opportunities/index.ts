
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

  console.log("[match] Using Enter AI (Claude Sonnet 4.5)");
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
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("[match] Enter AI error:", response.status, errText.slice(0, 300));
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

  console.log("[match] Using Gemini 2.0 Flash");
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

  for (let attempt = 1; attempt <= 3; attempt++) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
      }),
    });

    if (resp.status === 429 && attempt < 3) {
      console.log(`[match] Gemini 429, retry ${attempt}/3...`);
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
    const { chemicals } = await req.json();
    if (!chemicals?.length) {
      return new Response(JSON.stringify({ error: "No chemicals provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[match] === START === ${chemicals.length} chemicals, provider: ${AI_PROVIDER}`);

    const prompt = `You are a legal and clinical trial matching expert. Given the following hazardous chemicals a consumer has been exposed to through retail products, find matching class action lawsuits and clinical trials.

Chemicals detected: ${chemicals.join(", ")}

Return ONLY valid JSON (no markdown, no code fences, no explanation):
{
  "lawsuits": [
    {
      "id": "<unique id>",
      "title": "<lawsuit title>",
      "defendant": "<company name>",
      "settlementAmount": "<dollar amount or Pending>",
      "deadline": "<YYYY-MM-DD or TBD>",
      "status": "<active|pending|closed>",
      "matchConfidence": <0-100>,
      "matchedChemicals": [<chemicals from input that match>],
      "matchedProducts": [<known product names involved>],
      "description": "<brief description>",
      "payoutTiers": [
        {"tier": "<tier name>", "amount": "<dollar range>", "requirement": "<what's needed>"}
      ]
    }
  ],
  "trials": [
    {
      "id": "<unique id>",
      "title": "<trial title>",
      "sponsor": "<pharma company, prefer Regeneron if applicable>",
      "molecule": "<drug name>",
      "phase": "<Phase 1|2|3|4>",
      "condition": "<medical condition>",
      "linkedChemicals": [<chemicals from input linked to this condition>],
      "eligibilityMatch": <0-100>,
      "locations": [<US cities>],
      "status": "<recruiting|upcoming|active>",
      "description": "<brief description including how chemical exposure links to the condition>",
      "nctId": "<NCT number>",
      "compensation": "<what participants receive>"
    }
  ]
}

Focus on real, well-known class action lawsuits and Regeneron clinical trials where possible.`;

    const rawText = AI_PROVIDER === "enter"
      ? await callEnterAI(prompt)
      : await callGemini(prompt);

    console.log("[match] Raw response length:", rawText.length);
    const cleanJson = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const opportunities = JSON.parse(cleanJson);
    console.log("[match] === SUCCESS === Lawsuits:", opportunities.lawsuits?.length, "Trials:", opportunities.trials?.length);

    return new Response(JSON.stringify(opportunities), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[match] === CRASH ===", error.message);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
