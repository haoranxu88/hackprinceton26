import { corsJson, handlePreflight } from "../_shared/cors.ts";

/**
 * POST /dedalus-agent
 * Body: { task: "analyze" | "match", data: {...} }
 *
 * Alternate LLM provider routed through Dedalus Labs (OpenAI-compatible).
 * Primary analysis runs on Gemini via analyze-exposure / match-opportunities.
 * This function exists as a drop-in swap if Gemini is rate-limited or down.
 */
Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    const apiKey = Deno.env.get("DEDALUS_API_KEY");
    if (!apiKey) throw new Error("DEDALUS_API_KEY not configured");

    const { task, data } = await req.json();
    console.log("[dedalus] Task:", task);

    let systemPrompt: string;
    let userPrompt: string;

    if (task === "analyze") {
      const products = (data?.products ?? []) as { name: string; description: string }[];
      const productList = products
        .map((p, i) => `${i + 1}. "${p.name}" - ${p.description || "No description"}`)
        .join("\n");

      systemPrompt =
        "You are an EPA toxicology expert. You analyze consumer products for hazardous chemicals and return structured JSON.";
      userPrompt = `Analyze these products for hazardous chemicals:\n\n${productList}\n\nReturn ONLY valid JSON:\n{"overallScore":<0-100>,"percentile":<number>,"riskLevel":"<safe|moderate|high|critical>","totalProductsScanned":${products.length},"flaggedProducts":<number>,"chemicals":[{"chemical":"<name>","casNumber":"<CAS>","category":"<carcinogen|endocrine_disruptor|irritant|neurotoxin>","exposureRoute":"<dermal|inhalation|ingestion>","concentrationPpm":<number>,"kp":<number>,"contactTimeHrs":<number>,"frequency":<number>,"riskLevel":"<safe|moderate|high|critical>","products":["<product names>"],"healthEffects":["<effects>"]}]}\n\nFocus on benzene, formaldehyde, talc, parabens, phthalates, PFAS, oxybenzone, aluminum.`;
    } else if (task === "match") {
      const chemicals = (data?.chemicals ?? []) as string[];
      systemPrompt =
        "You are a legal matching expert. You match chemical exposures to active class action lawsuits.";
      userPrompt = `Chemicals detected: ${chemicals.join(", ")}\n\nReturn ONLY valid JSON:\n{"lawsuits":[{"id":"<id>","title":"<title>","defendant":"<company>","settlementAmount":"<amount>","deadline":"<date>","status":"<active|pending>","matchType":"<'product' | 'chemical'>","matchedOn":[<specific tokens that matched, 1-4 items>],"matchedChemicals":[<chemicals>],"matchedProducts":[<products>],"description":"<desc>","payoutTiers":[{"tier":"<name>","amount":"<range>","requirement":"<req>"}],"claimUrl":"<official settlement site if known, else omit>"}]}\n\nmatchType rules: "product" when the lawsuit's eligible-product list names something the user plausibly bought; "chemical" only when the overlap is the ingredient alone. Drop any lawsuit with no real overlap. Sort lawsuits so every product match precedes any chemical match.`;
    } else {
      return corsJson({ error: "Unknown task. Use 'analyze' or 'match'" }, { status: 400 });
    }

    const response = await fetch("https://api.dedaluslabs.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
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
      return corsJson(
        { error: `Dedalus API ${response.status}`, detail: errText.slice(0, 300) },
        { status: 502 },
      );
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (!content) return corsJson({ error: "Empty Dedalus response" }, { status: 502 });

    const cleanJson = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleanJson);

    // Trials feature is retired; strip it out if the model still emits it.
    if (parsed && typeof parsed === "object") delete (parsed as Record<string, unknown>).trials;

    console.log("[dedalus] Success for task:", task);

    return corsJson(parsed);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[dedalus] error:", msg);
    return corsJson({ error: msg }, { status: 500 });
  }
});
