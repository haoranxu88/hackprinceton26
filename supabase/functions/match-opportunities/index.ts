
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// === AI PROVIDER CONFIG ===
// Options: "enter" (default), "gemini", "dedalus"
const AI_PROVIDER = "dedalus";
// ==========================

async function callEnterAI(prompt: string): Promise<string> {
  const token = Deno.env.get("AI_API_TOKEN_f11936aa39dd");
  if (!token) throw new Error("AI_API_TOKEN not configured");
  console.log("[match] Using Enter AI");
  const response = await fetch("https://api.enter.pro/code/api/v1/ai/messages", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-4.5",
      messages: [{ role: "user", content: prompt }],
      stream: false, max_tokens: 4096, temperature: 0.3,
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Enter AI ${response.status}: ${errText.slice(0, 200)}`);
  }
  const data = await response.json();
  return data.content?.[0]?.text || (() => { throw new Error("Empty Enter AI response"); })();
}

async function callGemini(prompt: string): Promise<string> {
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) throw new Error("GEMINI_API_KEY not configured");
  console.log("[match] Using Gemini");
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 4096 } }),
    });
    if (resp.status === 429 && attempt < 3) { await new Promise(r => setTimeout(r, attempt * 5000)); continue; }
    const text = await resp.text();
    if (!resp.ok) throw new Error(`Gemini ${resp.status}: ${text.slice(0, 200)}`);
    const data = JSON.parse(text);
    return data.candidates?.[0]?.content?.parts?.[0]?.text || (() => { throw new Error("Empty Gemini response"); })();
  }
  throw new Error("Gemini max retries exceeded");
}

async function callDedalus(prompt: string): Promise<string> {
  const apiKey = Deno.env.get("DEDALUS_API_KEY");
  if (!apiKey) throw new Error("DEDALUS_API_KEY not configured");
  console.log("[match] Using Dedalus");
  const response = await fetch("https://api.dedaluslabs.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a legal and clinical trial matching expert. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3, max_tokens: 4096,
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Dedalus ${response.status}: ${errText.slice(0, 200)}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || (() => { throw new Error("Empty Dedalus response"); })();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { chemicals } = await req.json();
    if (!chemicals?.length) {
      return new Response(JSON.stringify({ error: "No chemicals provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[match] ${chemicals.length} chemicals, provider: ${AI_PROVIDER}`);

    const prompt = `Given these hazardous chemicals a consumer was exposed to through retail products, find matching class action lawsuits and clinical trials.

Chemicals: ${chemicals.join(", ")}

Return ONLY valid JSON (no markdown, no code fences):
{"lawsuits":[{"id":"<id>","title":"<title>","defendant":"<company>","settlementAmount":"<amount>","deadline":"<YYYY-MM-DD or TBD>","status":"<active|pending|closed>","matchConfidence":<0-100>,"matchedChemicals":[<chemicals>],"matchedProducts":[<products>],"description":"<desc>","payoutTiers":[{"tier":"<name>","amount":"<range>","requirement":"<req>"}]}],"trials":[{"id":"<id>","title":"<title>","sponsor":"<pharma, prefer Regeneron>","molecule":"<drug>","phase":"<Phase 1-4>","condition":"<condition>","linkedChemicals":[<chemicals>],"eligibilityMatch":<0-100>,"locations":[<cities>],"status":"<recruiting|active>","description":"<desc including chemical-condition link>","nctId":"<NCT>","compensation":"<comp>"}]}

Focus on real lawsuits and Regeneron clinical trials where possible.`;

    const callProvider = { enter: callEnterAI, gemini: callGemini, dedalus: callDedalus }[AI_PROVIDER];
    if (!callProvider) throw new Error(`Unknown provider: ${AI_PROVIDER}`);

    const rawText = await callProvider(prompt);
    const cleanJson = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const opportunities = JSON.parse(cleanJson);
    opportunities._provider = AI_PROVIDER;
    console.log("[match] SUCCESS Lawsuits:", opportunities.lawsuits?.length, "Trials:", opportunities.trials?.length);

    return new Response(JSON.stringify(opportunities), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[match] CRASH:", error.message);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
