
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

    console.log(`Analyzing ${products.length} products for chemical exposure`);

    const productList = products
      .map((p: { name: string; description: string }, i: number) =>
        `${i + 1}. "${p.name}" - ${p.description || "No description"}`
      )
      .join("\n");

    const prompt = `You are an EPA toxicology expert analyzing consumer products for hazardous chemical exposure.

For each product below, identify any hazardous chemicals it likely contains based on known ingredient databases (CPDat, Open Food Facts, EWG).

Products to analyze:
${productList}

Return a JSON object with this exact structure:
{
  "overallScore": <number 0-100, overall toxic load score>,
  "percentile": <number, estimated population percentile>,
  "riskLevel": "<safe|moderate|high|critical>",
  "totalProductsScanned": ${products.length},
  "flaggedProducts": <number of products containing hazardous chemicals>,
  "chemicals": [
    {
      "chemical": "<chemical name>",
      "casNumber": "<CAS number>",
      "category": "<carcinogen|endocrine_disruptor|irritant|neurotoxin>",
      "exposureRoute": "<dermal|inhalation|ingestion>",
      "concentrationPpm": <estimated concentration in ppm>,
      "kp": <permeability coefficient cm/hr>,
      "contactTimeHrs": <typical contact time>,
      "frequency": <estimated uses per month based on product type>,
      "riskLevel": "<safe|moderate|high|critical>",
      "products": [<list of product names containing this chemical>],
      "healthEffects": [<list of health effects>]
    }
  ]
}

Be scientifically accurate. Focus on chemicals with documented health risks like benzene, formaldehyde, talc, parabens, phthalates, PFAS, oxybenzone, aluminum compounds. Only return valid JSON, no markdown fences or other text.`;

    // Use x-goog-api-key header per official Gemini REST docs
    const geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

    console.log("Calling Gemini at:", geminiUrl);
    console.log("API key starts with:", geminiKey.slice(0, 10) + "...");

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
    console.log("Gemini response preview:", responseText.slice(0, 300));

    if (!geminiResponse.ok) {
      console.error("Gemini API error full:", responseText);
      return new Response(
        JSON.stringify({ error: `Gemini API ${geminiResponse.status}`, details: responseText.slice(0, 500) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiData = JSON.parse(responseText);
    const textContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textContent) {
      console.error("No content in Gemini response:", JSON.stringify(geminiData).slice(0, 300));
      return new Response(
        JSON.stringify({ error: "No content in Gemini response", details: JSON.stringify(geminiData).slice(0, 300) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Strip markdown code fences if present
    const cleanJson = textContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const analysis = JSON.parse(cleanJson);
    console.log("Analysis complete. Score:", analysis.overallScore, "Chemicals:", analysis.chemicals?.length);

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("analyze-exposure error:", error.message, error.stack);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
