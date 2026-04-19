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
 */

function normChem(s: string): string {
  return s.trim().toLowerCase();
}

type MatchType = "product" | "chemical";
interface CatalogMatch {
  type: MatchType;
  matchedOn: string[];
}

/**
 * Classify a catalog row against the user's detected tokens (chemicals + purchased product keywords).
 * Returns "product" if any token hits `title` / `eligible_products` / `product_category`,
 * "chemical" if any token hits `chemicals_involved` only,
 * or null if there's no overlap at all.
 */
function classifyCatalogRow(row: Record<string, unknown>, chemicals: string[]): CatalogMatch | null {
  const tokens = chemicals.map(normChem).filter((t) => t.length >= 3);
  if (!tokens.length) return null;

  const involved = Array.isArray(row.chemicals_involved)
    ? (row.chemicals_involved as unknown[]).map((c) => normChem(String(c))).filter(Boolean)
    : [];

  const productHay = [row.title, row.eligible_products, row.product_category]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const productHits: string[] = [];
  const chemicalHits: string[] = [];

  for (const t of tokens) {
    if (productHay.includes(t)) {
      productHits.push(t);
      continue;
    }
    const parts = t.split(/[^a-z0-9]+/).filter((p) => p.length >= 4);
    if (parts.some((p) => productHay.includes(p))) {
      productHits.push(t);
      continue;
    }
    if (involved.some((i) => i === t || i.includes(t) || t.includes(i))) {
      chemicalHits.push(t);
    }
  }

  if (productHits.length > 0) {
    return { type: "product", matchedOn: Array.from(new Set(productHits)) };
  }
  if (chemicalHits.length > 0) {
    return { type: "chemical", matchedOn: Array.from(new Set(chemicalHits)) };
  }
  return null;
}

function fallbackLawsuitsFromCatalog(
  catalog: Record<string, unknown>[],
  chemicals: string[],
  max = 8,
): Record<string, unknown>[] {
  const classified = catalog
    .map((row) => ({ row, match: classifyCatalogRow(row, chemicals) }))
    .filter((x): x is { row: Record<string, unknown>; match: CatalogMatch } => x.match !== null);

  // Sort product matches above chemical matches.
  classified.sort((a, b) => {
    if (a.match.type === b.match.type) return 0;
    return a.match.type === "product" ? -1 : 1;
  });

  return classified.slice(0, max).map(({ row, match }) => {
    const payout = row.payout_estimate != null ? String(row.payout_estimate) : "Unknown";
    const tiers = Array.isArray(row.payout_tiers) && (row.payout_tiers as unknown[]).length
      ? row.payout_tiers
      : [{ tier: "Standard", amount: payout, requirement: "See claim site" }];

    const matchedChemicals = chemicals.filter((c) => {
      const t = normChem(c);
      const inv = Array.isArray(row.chemicals_involved)
        ? (row.chemicals_involved as unknown[]).map((x) => normChem(String(x)))
        : [];
      return inv.some((i) => i.includes(t) || t.includes(i));
    });

    return {
      id: row.id,
      title: String(row.title ?? ""),
      defendant: String(row.defendant ?? ""),
      settlementAmount: payout,
      deadline: row.deadline != null ? String(row.deadline) : "TBD",
      status: String(row.status ?? "active"),
      matchType: match.type,
      matchedOn: match.matchedOn,
      matchedChemicals: matchedChemicals.length ? matchedChemicals : chemicals.slice(0, 2),
      matchedProducts: String(row.eligible_products ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 4),
      description:
        match.type === "product"
          ? "Named in the settlement's eligible-product list."
          : "Matched on a chemical/ingredient disclosed in the settlement.",
      payoutTiers: tiers,
      claimUrl: typeof row.claim_url === "string" && row.claim_url ? row.claim_url : undefined,
    };
  });
}

function buildCatalogPrompt(chemicals: string[], catalog: Record<string, unknown>[]): string {
  const catalogJson = JSON.stringify(catalog).slice(0, 95_000);
  return `You match detected consumer-product chemicals to known class action settlements.

Detected chemicals (from purchase history / exposure scan):
${chemicals.join(", ")}

Settlement catalog (JSON array from our database — use ONLY these entries; each has id, defendant, title, payout_estimate, deadline, eligible_products, chemicals_involved, payout_tiers, claim_url, proof_required):
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
    "matchType":"<'product' if any detected chemical/product keyword appears in catalog.title / eligible_products / product_category; else 'chemical' if it only appears in catalog.chemicals_involved>",
    "matchedOn":[<the specific detected tokens that triggered the match, 1-4 items>],
    "matchedChemicals":[<subset of detected chemicals that justify the match>],
    "matchedProducts":[<short product keywords inferred from eligible_products, 1-4 items>],
    "description":"<one sentence tying user's chemicals/products to this settlement>",
    "payoutTiers": <copy catalog payout_tiers array if non-empty; else [{"tier":"Standard","amount":settlementAmount,"requirement":"See claim site"}]>,
    "claimUrl":"<copy catalog claim_url verbatim; omit only if the catalog row has no claim_url>"
  }
]}

Rules:
- Include at most 8 lawsuits, only from the catalog, sorted so every "product" match appears before any "chemical" match.
- Only include a lawsuit if at least one detected token actually overlaps the catalog row's title, eligible_products, product_category, or chemicals_involved. Drop rows with no overlap entirely — never invent a connection.
- Prefer "product" classification: if any detected token matches title / eligible_products / product_category, set matchType = "product". Use "chemical" ONLY when the match is purely against chemicals_involved.
- Today's date is ${new Date().toISOString().slice(0, 10)}. Exclude any catalog row whose deadline is a valid ISO date strictly in the past. Keep rows with "TBD" / blank / pending deadlines.
- Always copy the catalog row's claim_url verbatim into claimUrl when present.
- Never invent settlement amounts: use catalog fields.`;
}

function buildFallbackPrompt(chemicals: string[]): string {
  return `Given these hazardous chemicals a consumer was exposed to through retail products, find matching class action lawsuits.

Chemicals: ${chemicals.join(", ")}

Return ONLY valid JSON (no markdown, no code fences):
{"lawsuits":[{"id":"<id>","title":"<title>","defendant":"<company>","settlementAmount":"<amount>","deadline":"<YYYY-MM-DD or TBD>","status":"<active|pending|closed>","matchType":"<'product' | 'chemical'>","matchedOn":[<specific tokens that matched, 1-4 items>],"matchedChemicals":[<chemicals>],"matchedProducts":[<products>],"description":"<desc>","payoutTiers":[{"tier":"<name>","amount":"<range>","requirement":"<req>"}],"claimUrl":"<official settlement site if known, else omit>"}]}

matchType rules: use "product" whenever the lawsuit's eligible-product list names something the user would plausibly have bought; use "chemical" only when the link is the ingredient alone. Sort lawsuits so every product match comes before any chemical match. Focus on real, active class action settlements.`;
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

    const todayMs = (() => {
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      return d.getTime();
    })();
    const deadlineStillOpen = (raw: unknown): boolean => {
      if (raw == null) return true;
      const s = String(raw).trim();
      if (!s || s.toUpperCase() === "TBD") return true;
      const ts = Date.parse(s);
      if (Number.isNaN(ts)) return true;
      return ts >= todayMs;
    };

    const catalog = ((settlementRows ?? []).filter(Boolean)) as Record<string, unknown>[];
    const originalCatalogSize = catalog.length;
    const dateFiltered = catalog.filter((row) => deadlineStillOpen(row.deadline));

    // Collapse duplicate catalog rows: prefer claim_url; fall back to (title | defendant).
    // The scraper occasionally ingests the same claim twice under different Supabase IDs.
    const dedupeKey = (row: Record<string, unknown>): string => {
      const norm = (v: unknown) =>
        String(v ?? "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .replace(/[^a-z0-9 ]/g, "")
          .trim();
      const url = norm(row.claim_url).replace(/^https?/, "").replace(/\/$/, "");
      if (url) return `u:${url}`;
      return `td:${norm(row.title)}|${norm(row.defendant)}`;
    };
    const seenCatalog = new Map<string, Record<string, unknown>>();
    for (const row of dateFiltered) {
      const k = dedupeKey(row);
      if (!seenCatalog.has(k)) seenCatalog.set(k, row);
    }
    const openCatalog = Array.from(seenCatalog.values());

    console.log(
      `[match] ${chemicals.length} chemicals, catalog size: ${openCatalog.length} (deduped from ${dateFiltered.length}, original ${originalCatalogSize}), provider: gemini`,
    );

    const prompt = openCatalog.length > 0
      ? buildCatalogPrompt(chemicals, openCatalog)
      : buildFallbackPrompt(chemicals);

    const rawText = await callGemini(prompt, { label: "match", temperature: 0.25 });
    const opportunities = parseJsonWithRepair<Record<string, unknown>>(rawText, "match");
    opportunities._provider = "gemini";

    const rawLawsuits = Array.isArray(opportunities.lawsuits) ? (opportunities.lawsuits as unknown[]) : [];
    // Defensive: strip any LLM rows that slipped through with a passed deadline.
    const dateKeptLawsuits = rawLawsuits.filter((l) => {
      if (!l || typeof l !== "object") return false;
      return deadlineStillOpen((l as Record<string, unknown>).deadline);
    });
    // Defensive: collapse duplicate lawsuits the LLM may have emitted twice.
    const seenLawsuits = new Map<string, Record<string, unknown>>();
    for (const l of dateKeptLawsuits) {
      const row = l as Record<string, unknown>;
      const k = dedupeKey({
        claim_url: row.claimUrl,
        title: row.title,
        defendant: row.defendant,
      });
      if (!seenLawsuits.has(k)) seenLawsuits.set(k, row);
    }
    const lawsuitArr = Array.from(seenLawsuits.values());
    opportunities.lawsuits = lawsuitArr;

    if (openCatalog.length > 0 && lawsuitArr.length === 0) {
      opportunities.lawsuits = fallbackLawsuitsFromCatalog(openCatalog, chemicals);
      opportunities._lawsuitFallback = "catalog_keyword_ranking";
      console.log(
        "[match] Gemini returned 0 lawsuits; applied catalog keyword fallback, count:",
        (opportunities.lawsuits as unknown[])?.length,
      );
    }

    // Drop any trials payload the LLM may still emit — trials feature is retired.
    delete opportunities.trials;

    console.log(
      "[match] SUCCESS Lawsuits:",
      (opportunities.lawsuits as unknown[])?.length,
    );

    return corsJson(opportunities);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[match] CRASH:", msg);
    return corsJson({ error: msg }, { status: 500 });
  }
});
