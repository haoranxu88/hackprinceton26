import { corsJson, handlePreflight } from "../_shared/cors.ts";

/**
 * POST /scrape-settlements
 *
 * Thin UI-triggered wrapper: run `discover-settlements` then `enrich-settlements`
 * synchronously so the header "Settlements" button gives an immediate result.
 * The same two functions are also called on a schedule by pg_cron.
 */
Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured");
    }

    const base = `${supabaseUrl.replace(/\/$/, "")}/functions/v1`;
    const headers = {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    };

    const callStage = async (stage: "discover-settlements" | "enrich-settlements") => {
      const resp = await fetch(`${base}/${stage}`, { method: "POST", headers, body: "{}" });
      const text = await resp.text();
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        throw new Error(`${stage} non-JSON: ${text.slice(0, 200)}`);
      }
      if (!resp.ok) throw new Error(String(json.error ?? text.slice(0, 200)));
      return json;
    };

    const discover = await callStage("discover-settlements");
    const enrich = await callStage("enrich-settlements");

    return corsJson({ ok: true, discover, enrich });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[scrape] CRASH:", msg);
    return corsJson({ error: msg }, { status: 500 });
  }
});
