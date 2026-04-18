
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
    console.log("[analyze] === START ===");
    console.log("[analyze] GEMINI_API_KEY present:", !!geminiKey);
    console.log("[analyze] Key prefix:", geminiKey ? geminiKey.slice(0, 12) + "..." : "MISSING");
    console.log("[analyze] Key length:", geminiKey?.length);

    if (!geminiKey) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { products } = body;
    console.log("[analyze] Products received:", products?.length);

    if (!products || !Array.isArray(products) || products.length === 0) {
      return new Response(
        JSON.stringify({ error: "No products provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // Attempt with retries
    let lastStatus = 0;
    let lastBody = "";
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`[analyze] Attempt ${attempt}/3 - calling Gemini...`);
      const startTime = Date.now();

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

      lastStatus = geminiResponse.status;
      lastBody = await geminiResponse.text();
      const elapsed = Date.now() - startTime;

      console.log(`[analyze] Attempt ${attempt} status: ${lastStatus} (${elapsed}ms)`);
      console.log(`[analyze] Attempt ${attempt} response preview: ${lastBody.slice(0, 300)}`);

      if (lastStatus === 200) {
        // Success! Parse and return
        const geminiData = JSON.parse(lastBody);
        const textContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log("[analyze] Got text content, length:", textContent?.length);

        if (!textContent) {
          console.error("[analyze] Empty text content in response");
          return new Response(
            JSON.stringify({ error: "Empty Gemini response", raw: JSON.stringify(geminiData).slice(0, 300) }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const cleanJson = textContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        console.log("[analyze] Clean JSON preview:", cleanJson.slice(0, 200));

        const analysis = JSON.parse(cleanJson);
        console.log("[analyze] === SUCCESS === Score:", analysis.overallScore, "Chemicals:", analysis.chemicals?.length);

        return new Response(JSON.stringify(analysis), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (lastStatus === 429 && attempt < 3) {
        const waitMs = attempt * 8000; // 8s, 16s
        console.log(`[analyze] Rate limited! Waiting ${waitMs}ms...`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      // Non-retryable error
      break;
    }

    // All attempts failed
    console.error(`[analyze] === FAILED === Final status: ${lastStatus}`);
    console.error(`[analyze] Final body: ${lastBody.slice(0, 500)}`);

    return new Response(
      JSON.stringify({
        error: `Gemini API returned ${lastStatus} after retries`,
        detail: lastBody.slice(0, 500),
        keyPrefix: geminiKey.slice(0, 12),
      }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[analyze] === CRASH ===", error.message, error.stack);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
