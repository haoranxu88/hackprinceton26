import { callGemini, parseJsonWithRepair } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { chemicals } = await req.json();
    if (!chemicals?.length) {
      return new Response(JSON.stringify({ error: "No chemicals provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[chemical-health-effects] ${chemicals.length} chemicals`);

    const chemicalList = (chemicals as string[]).map((c, i) => `${i + 1}. ${c}`).join("\n");

    const prompt = `You are a toxicology and public health expert. For each of the following chemicals that a person is being exposed to through consumer products, list the specific diseases, illnesses, cancers, and health conditions they are known to cause in humans based on scientific and medical evidence.

Chemicals:
${chemicalList}

Return ONLY valid JSON (no markdown, no code fences):
{"effects":[{"chemical":"<exact chemical name from list>","conditions":["<condition1>","<condition2>","<condition3>"]}]}

Be specific and comprehensive. Include cancers, chronic diseases, acute conditions, organ damage, neurological effects, hormonal disruption, and any other documented health risks. Each chemical should have at least 3-6 conditions.`;

    const rawText = await callGemini(prompt, { label: "chemical-effects", temperature: 0.2, maxOutputTokens: 4096 });
    const result = parseJsonWithRepair<{ effects: { chemical: string; conditions: string[] }[] }>(rawText, "chemical-effects");

    console.log(`[chemical-health-effects] SUCCESS, ${result.effects?.length} chemicals processed`);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[chemical-health-effects] CRASH:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
