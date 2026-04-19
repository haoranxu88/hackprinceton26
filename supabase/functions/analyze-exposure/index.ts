import { corsJson, handlePreflight } from "../_shared/cors.ts";
import { callGemini, parseJsonWithRepair } from "../_shared/gemini.ts";

/**
 * POST /analyze-exposure
 * Body: { products: { name, description }[] }
 *
 * Sends the product list to Gemini and returns a structured toxic-load analysis.
 * Fallback providers (Enter AI, Dedalus) live in the separate dedalus-agent function.
 */
Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    const { products } = await req.json();
    if (!products?.length) {
      return corsJson({ error: "No products provided" }, { status: 400 });
    }

    console.log(`[analyze] ${products.length} products, provider: gemini`);

    const productList = products
      .map(
        (p: { name: string; description: string }, i: number) =>
          `${i + 1}. "${p.name}" - ${p.description || "No description"}`,
      )
      .join("\n");

    const prompt = `Analyze these consumer products for hazardous chemicals.

Products:
${productList}

Return ONLY valid JSON (no markdown, no code fences):
{"overallScore":<0-100>,"percentile":<number>,"riskLevel":"<safe|moderate|high|critical>","totalProductsScanned":${products.length},"flaggedProducts":<number>,"chemicals":[{"chemical":"<name>","casNumber":"<CAS>","category":"<carcinogen|endocrine_disruptor|irritant|neurotoxin>","exposureRoute":"<dermal|inhalation|ingestion>","concentrationPpm":<number>,"kp":<number>,"contactTimeHrs":<number>,"frequency":<number>,"riskLevel":"<safe|moderate|high|critical>","products":["<product names>"],"healthEffects":["<effects>"]}]}

Focus on benzene, formaldehyde, talc, parabens, phthalates, PFAS, oxybenzone, aluminum.`;

    const rawText = await callGemini(prompt, { label: "analyze", temperature: 0.2 });
    const analysis = parseJsonWithRepair<Record<string, unknown>>(rawText, "analyze");

    analysis._provider = "gemini";
    console.log("[analyze] SUCCESS Score:", analysis.overallScore);

    return corsJson(analysis);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[analyze] CRASH:", msg);
    return corsJson({ error: msg }, { status: 500 });
  }
});
