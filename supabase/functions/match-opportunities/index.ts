
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    console.log(`Matching opportunities for chemicals:`, chemicals);

    const prompt = `You are a legal and clinical trial matching expert. Given the following list of hazardous chemicals a consumer has been exposed to through retail products, find matching class action lawsuits and clinical trials.

Chemicals detected: ${chemicals.join(", ")}

Return a JSON object with this exact structure:
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

Focus on:
- Real, well-known class action lawsuits (benzene in dry shampoo, talc/J&J, sunscreen recalls, etc.)
- Regeneron clinical trials where possible (Linvoseltamab for Multiple Myeloma, Ubamatamab for Ovarian Cancer, Dupixent for Eczema)
- Be factually accurate about settlement amounts and trial phases
- Only return the JSON, no other text.`;

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error("Gemini API error:", errText);
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();
    const textContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textContent) {
      throw new Error("No content in Gemini response");
    }

    const opportunities = JSON.parse(textContent);
    console.log("Matching complete. Lawsuits:", opportunities.lawsuits?.length, "Trials:", opportunities.trials?.length);

    return new Response(JSON.stringify(opportunities), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("match-opportunities error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
