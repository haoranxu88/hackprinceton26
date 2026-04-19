import { corsJson, handlePreflight } from "../_shared/cors.ts";
import { callGemini, parseJsonWithRepair } from "../_shared/gemini.ts";
import { getServiceClient } from "../_shared/supabase.ts";

/**
 * POST /match-opportunities
 * Body: { chemicals: string[] }
 *
 * Strategy:
 * 1. Pull enriched settlements from the curated `settlements` table.
 * 2. Ask Gemini to score / narrate matches ONLY from that catalog.
 * 3. If Gemini whiffs (returns zero lawsuits), fall back to a deterministic
 *    keyword ranker so users always see relevant catalog rows.
 *
 * Clinical trials remain LLM-generated because payout specificity matters less.
 */

function normChem(s: string): string {
  return s.trim().toLowerCase();
}

/** Deterministic overlap score when the LLM returns no lawsuits. */
function scoreCatalogRow(row: Record<string, unknown>, chemicals: string[]): number {
  const tokens = chemicals.map(normChem).filter(Boolean);
  if (!tokens.length) return 0;

  const involved = Array.isArray(row.chemicals_involved)
    ? (row.chemicals_involved as unknown[]).map((c) => normChem(String(c))).filter(Boolean)
    : [];

  const hay = [
    row.title,
    row.defendant,
    row.product_category,
    row.eligible_products,
    involved.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let score = 0;
  for (const t of tokens) {
    if (!t) continue;
    if (involved.some((i) => i === t || i.includes(t) || t.includes(i))) score += 42;
    else if (hay.includes(t)) score += 22;
    else {
      const parts = t.split(/[^a-z0-9]+/).filter((p) => p.length >= 4);
      for (const p of parts) {
        if (hay.includes(p)) score += 12;
      }
    }
  }
  return Math.min(100, score);
}

function fallbackLawsuitsFromCatalog(
  catalog: Record<string, unknown>[],
  chemicals: string[],
  max = 8,
): Record<string, unknown>[] {
  const scored = catalog
    .map((row) => ({ row, score: scoreCatalogRow(row, chemicals) }))
    .sort((a, b) => b.score - a.score);

  const strong = scored.filter((s) => s.score >= 8).slice(0, max);
  const picked = strong.length > 0 ? strong : scored.slice(0, Math.min(5, scored.length));

  return picked.map(({ row, score }) => {
    const payout = row.payout_estimate != null ? String(row.payout_estimate) : "Unknown";
    const tiers = Array.isArray(row.payout_tiers) && (row.payout_tiers as unknown[]).length
      ? row.payout_tiers
      : [{ tier: "Standard", amount: payout, requirement: "See claim site" }];

    const conf = score >= 28 ? score : Math.min(44, 26 + Math.round(score / 2));

    const matched = chemicals.filter((c) => {
      const t = normChem(c);
      const inv = Array.isArray(row.chemicals_involved)
        ? (row.chemicals_involved as unknown[]).map((x) => normChem(String(x)))
        : [];
      const hay = `${row.title} ${row.defendant} ${row.eligible_products} ${row.product_category}`.toLowerCase();
      return inv.some((i) => i.includes(t) || t.includes(i)) || hay.includes(t);
    });

    return {
      id: row.id,
      title: String(row.title ?? ""),
      defendant: String(row.defendant ?? ""),
      settlementAmount: payout,
      deadline: row.deadline != null ? String(row.deadline) : "TBD",
      status: String(row.status ?? "active"),
      matchConfidence: conf,
      matchedChemicals: matched.length ? matched : chemicals.slice(0, 2),
      matchedProducts: String(row.eligible_products ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 4),
      description:
        score >= 12
          ? "Matched from curated settlement catalog based on chemical or product keywords in the listing."
          : "Broad catalog match — confirm chemicals and products against the official claim notice.",
      payoutTiers: tiers,
    };
  });
}

function buildCatalogPrompt(chemicals: string[], catalog: Record<string, unknown>[]): string {
  const catalogJson = JSON.stringify(catalog).slice(0, 95_000);
  return `You match detected consumer-product chemicals to known class action settlements and suggest clinical trials.

Detected chemicals (from purchase history / exposure scan):
${chemicals.join(", ")}

Settlement catalog (JSON array from our database — use ONLY these entries for lawsuits; each has id, defendant, title, payout_estimate, deadline, eligible_products, chemicals_involved, payout_tiers, claim_url, proof_required):
${catalogJson}

Return ONLY valid JSON (no markdown, no code fences):
{"lawsuits":[
  {
    "id":"<must equal one of the catalog id values>",
    "title":"<from catalog title, lightly edited for clarity>",
    "defendant":"<from catalog>",
    "settlementAmount":"<use catalog payout_estimate verbatim when possible>",
    "deadline":"<from catalog deadline; use TBD if empty>",
    "status":"<active|pending|closed> — prefer active from catalog status",
    "matchConfidence":<0-100 based on overlap between detected chemicals and catalog.chemicals_involved / eligible_products>,
    "matchedChemicals":[<subset of detected chemicals that justify the match>],
    "matchedProducts":[<short product keywords inferred from eligible_products, 1-4 items>],
    "description":"<one sentence tying user's chemicals to this settlement>",
    "payoutTiers": <copy catalog payout_tiers array if non-empty; else [{"tier":"Standard","amount":settlementAmount,"requirement":"See claim site"}]>
  }
],
"trials":[
  {
    "id":"<id>",
    "title":"<title>",
    "sponsor":"<pharma>",
    "molecule":"<drug>",
    "phase":"<Phase 1-4>",
    "condition":"<condition>",
    "linkedChemicals":[<chemicals>],
    "eligibilityMatch":<0-100>,
    "locations":[<cities>],
    "status":"<recruiting|active>",
    "description":"<desc>",
    "nctId":"<NCT>",
    "compensation":"<comp>"
  }
]}

Rules for lawsuits:
- Include at most 8 lawsuits, only from the catalog, sorted by matchConfidence descending.
- Use a generous match: product keywords (e.g. dry shampoo, sunscreen, baby powder, aerosol) can justify linking detected chemicals even when chemicals_involved is empty on the catalog row.
- Omit lawsuits below 22 matchConfidence only if you have at least 3 stronger matches; otherwise include the best available matches down to 18 so the user is not left with zero lawsuits when the catalog is non-empty.
- If the catalog is non-empty, you MUST return at least 1 lawsuit (the single best catalog row) unless there is absolutely no plausible string overlap between detected chemicals and any of title, eligible_products, product_category, chemicals_involved.
- Never invent settlement amounts: use catalog fields.
Rules for trials:
- Include 2-5 plausible trials linked to the detected chemicals (may be synthetic but realistic).`;
}

function buildFallbackPrompt(chemicals: string[]): string {
  return `Given these hazardous chemicals a consumer was exposed to through retail products, find matching class action lawsuits and clinical trials.

Chemicals: ${chemicals.join(", ")}

Return ONLY valid JSON (no markdown, no code fences):
{"lawsuits":[{"id":"<id>","title":"<title>","defendant":"<company>","settlementAmount":"<amount>","deadline":"<YYYY-MM-DD or TBD>","status":"<active|pending|closed>","matchConfidence":<0-100>,"matchedChemicals":[<chemicals>],"matchedProducts":[<products>],"description":"<desc>","payoutTiers":[{"tier":"<name>","amount":"<range>","requirement":"<req>"}]}],"trials":[{"id":"<id>","title":"<title>","sponsor":"<pharma, prefer Regeneron>","molecule":"<drug>","phase":"<Phase 1-4>","condition":"<condition>","linkedChemicals":[<chemicals>],"eligibilityMatch":<0-100>,"locations":[<cities>],"status":"<recruiting|active>","description":"<desc including chemical-condition link>","nctId":"<NCT>","compensation":"<comp>"}]}

Focus on real lawsuits and Regeneron clinical trials where possible.`;
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    const { chemicals } = await req.json();
    if (!chemicals?.length) {
      return corsJson({ error: "No chemicals provided" }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { data: settlementRows, error: dbError } = await supabase
      .from("settlements")
      .select(
        "id,defendant,title,product_category,eligible_products,chemicals_involved,deadline,payout_estimate,proof_required,claim_url,status,payout_tiers",
      )
      .eq("status", "active")
      .eq("enrichment_status", "enriched")
      .order("scraped_at", { ascending: false })
      .limit(45);

    if (dbError) console.error("[match] settlements query error:", dbError.message);

    const catalog = ((settlementRows ?? []).filter(Boolean)) as Record<string, unknown>[];
    console.log(`[match] ${chemicals.length} chemicals, catalog size: ${catalog.length}, provider: gemini`);

    const prompt = catalog.length > 0
      ? buildCatalogPrompt(chemicals, catalog)
      : buildFallbackPrompt(chemicals);

    const rawText = await callGemini(prompt, { label: "match", temperature: 0.25 });
    const opportunities = parseJsonWithRepair<Record<string, unknown>>(rawText, "match");
    opportunities._provider = "gemini";

    const lawsuitArr = Array.isArray(opportunities.lawsuits) ? (opportunities.lawsuits as unknown[]) : [];
    if (catalog.length > 0 && lawsuitArr.length === 0) {
      opportunities.lawsuits = fallbackLawsuitsFromCatalog(catalog, chemicals);
      opportunities._lawsuitFallback = "catalog_keyword_ranking";
      console.log(
        "[match] Gemini returned 0 lawsuits; applied catalog keyword fallback, count:",
        (opportunities.lawsuits as unknown[])?.length,
      );
    }

    console.log(
      "[match] SUCCESS Lawsuits:",
      (opportunities.lawsuits as unknown[])?.length,
      "Trials:",
      (opportunities.trials as unknown[])?.length,
    );

    return corsJson(opportunities);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[match] CRASH:", msg);
    return corsJson({ error: msg }, { status: 500 });
  }
});
