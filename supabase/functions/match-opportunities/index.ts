
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callGeminiWithRetry(geminiKey: string, body: object, maxRetries = 3): Promise<{ ok: boolean; status: number; text: string }> {
  const geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const resp = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiKey,
      },
      body: JSON.stringify(body),
    });

    const text = await resp.text();

    if (resp.status === 429 && attempt < maxRetries - 1) {
      const waitMs = (attempt + 1) * 5000;
      console.log(`Rate limited (429), waiting ${waitMs}ms before retry ${attempt + 1}/${maxRetries}...`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    return { ok: resp.ok, status: resp.status, text };
  }

  return { ok: false, status: 429, text: "Max retries exceeded" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) throw new Error("GEMINI_API_KEY not configured");

    const { chemicals } = await req.json();

    if (!chemicals || !Array.isArray(chemicals) || chemicals.length === 0) {
      return new Response(
        JSON.stringify({ error: "No chemicals provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Matching opportunities for", chemicals.length, "chemicals");

    const prompt = `You are a legal and clinical trial matching expert. Given the following list of hazardous chemicals a consumer has been exposed to through retail products, find matching class action lawsuits and clinical trials.

Chemicals detected: ${chemicals.join(", ")}

Return ONLY valid JSON (no markdown, no code fences):
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

    const result = await callGeminiWithRetry(geminiKey, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4096,
      },
    });

    console.log("Gemini status:", result.status);

    if (!result.ok) {
      console.error("Gemini error:", result.text.slice(0, 500));
      return new Response(
        JSON.stringify({ error: `Gemini API returned ${result.status}`, detail: result.text.slice(0, 500) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiData = JSON.parse(result.text);
    const textContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textContent) {
      return new Response(
        JSON.stringify({ error: "Empty Gemini response" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanJson = textContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const opportunities = JSON.parse(cleanJson);
    console.log("Matched", opportunities.lawsuits?.length, "lawsuits,", opportunities.trials?.length, "trials");

    return new Response(JSON.stringify(opportunities), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("match-opportunities error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
