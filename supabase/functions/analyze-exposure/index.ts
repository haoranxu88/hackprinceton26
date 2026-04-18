
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

    const { products } = await req.json();

    if (!products || !Array.isArray(products) || products.length === 0) {
      return new Response(
        JSON.stringify({ error: "No products provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Analyzing ${products.length} products. API key: ${geminiKey.slice(0, 10)}...`);

    const productList = products
      .map((p: { name: string; description: string }, i: number) =>
        `${i + 1}. "${p.name}" - ${p.description || "No description"}`
      )
      .join("\n");

    const prompt = `You are an EPA toxicology expert. Analyze these consumer products for hazardous chemicals.

Products:
${productList}

Return ONLY valid JSON (no markdown, no code fences):
{"overallScore":<0-100>,"percentile":<number>,"riskLevel":"<safe|moderate|high|critical>","totalProductsScanned":${products.length},"flaggedProducts":<number>,"chemicals":[{"chemical":"<name>","casNumber":"<CAS>","category":"<carcinogen|endocrine_disruptor|irritant|neurotoxin>","exposureRoute":"<dermal|inhalation|ingestion>","concentrationPpm":<number>,"kp":<number>,"contactTimeHrs":<number>,"frequency":<number>,"riskLevel":"<safe|moderate|high|critical>","products":["<product names>"],"healthEffects":["<effects>"]}]}

Focus on benzene, formaldehyde, talc, parabens, phthalates, PFAS, oxybenzone, aluminum.`;

    const geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 4096,
        },
      }),
    });

    const responseText = await geminiResponse.text();
    console.log("Gemini status:", geminiResponse.status);

    if (!geminiResponse.ok) {
      console.error("Gemini error:", responseText.slice(0, 500));
      return new Response(
        JSON.stringify({ 
          error: `Gemini API returned ${geminiResponse.status}`, 
          gemini_error: responseText.slice(0, 500),
          key_prefix: geminiKey.slice(0, 10)
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiData = JSON.parse(responseText);
    const textContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textContent) {
      return new Response(
        JSON.stringify({ error: "Empty Gemini response", raw: JSON.stringify(geminiData).slice(0, 300) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanJson = textContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const analysis = JSON.parse(cleanJson);
    console.log("Success! Score:", analysis.overallScore);

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("analyze-exposure crash:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
