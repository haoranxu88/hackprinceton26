
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("DEDALUS_API_KEY");
    if (!apiKey) throw new Error("DEDALUS_API_KEY not configured");

    const { task, data } = await req.json();
    console.log("[dedalus] Task:", task);

    let systemPrompt: string;
    let userPrompt: string;

    if (task === "analyze") {
      const products = data?.products || [];
      const productList = products
        .map((p: { name: string; description: string }, i: number) =>
          `${i + 1}. "${p.name}" - ${p.description || "No description"}`)
        .join("\n");

      systemPrompt = "You are an EPA toxicology expert. You analyze consumer products for hazardous chemicals and return structured JSON.";
      userPrompt = `Analyze these products for hazardous chemicals:\n\n${productList}\n\nReturn ONLY valid JSON:\n{"overallScore":<0-100>,"percentile":<number>,"riskLevel":"<safe|moderate|high|critical>","totalProductsScanned":${products.length},"flaggedProducts":<number>,"chemicals":[{"chemical":"<name>","casNumber":"<CAS>","category":"<carcinogen|endocrine_disruptor|irritant|neurotoxin>","exposureRoute":"<dermal|inhalation|ingestion>","concentrationPpm":<number>,"kp":<number>,"contactTimeHrs":<number>,"frequency":<number>,"riskLevel":"<safe|moderate|high|critical>","products":["<product names>"],"healthEffects":["<effects>"]}]}\n\nFocus on benzene, formaldehyde, talc, parabens, phthalates, PFAS, oxybenzone, aluminum.`;
    } else if (task === "match") {
      const chemicals = data?.chemicals || [];
      systemPrompt = "You are a legal and clinical trial matching expert. You match chemical exposures to class action lawsuits and clinical trials.";
      userPrompt = `Chemicals detected: ${chemicals.join(", ")}\n\nReturn ONLY valid JSON:\n{"lawsuits":[{"id":"<id>","title":"<title>","defendant":"<company>","settlementAmount":"<amount>","deadline":"<date>","status":"<active|pending>","matchConfidence":<0-100>,"matchedChemicals":[<chemicals>],"matchedProducts":[<products>],"description":"<desc>","payoutTiers":[{"tier":"<name>","amount":"<range>","requirement":"<req>"}]}],"trials":[{"id":"<id>","title":"<title>","sponsor":"<pharma, prefer Regeneron>","molecule":"<drug>","phase":"<Phase 1-4>","condition":"<condition>","linkedChemicals":[<chemicals>],"eligibilityMatch":<0-100>,"locations":[<cities>],"status":"<recruiting|active>","description":"<desc>","nctId":"<NCT>","compensation":"<comp>"}]}`;
    } else {
      return new Response(JSON.stringify({ error: "Unknown task. Use 'analyze' or 'match'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Dedalus uses OpenAI-compatible API
    const response = await fetch("https://api.dedaluslabs.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[dedalus] API error:", response.status, errText.slice(0, 300));
      return new Response(
        JSON.stringify({ error: `Dedalus API ${response.status}`, detail: errText.slice(0, 300) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(JSON.stringify({ error: "Empty Dedalus response" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const cleanJson = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleanJson);
    console.log("[dedalus] Success for task:", task);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[dedalus] error:", error.message);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
