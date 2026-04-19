import { corsJson, handlePreflight } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/supabase.ts";

/**
 * POST /match-opportunities
 * Body: { products: string[] }
 *
 * Strategy (deliberately strict + simple):
 * 1. Pull enriched settlements from the curated `settlements` table.
 * 2. For each settlement, match only when a distinctive brand token from the
 *    settlement's defendant/title appears as a whole word in one of the
 *    user's product names. No LLM, no fuzzy heuristics.
 * 3. Return whatever survives. If that's zero, that's the correct answer.
 */

// Generic filler that appears in both settlement titles and product names.
// We strip these before looking for a brand match.
const STOPWORDS = new Set<string>([
  "about", "above", "action", "actions", "against", "along", "also",
  "amount", "amounts", "any", "around", "because", "before", "behind",
  "below", "between", "beyond", "brand", "brands", "case", "cases",
  "class", "claim", "claims", "claimant", "consumer", "consumers",
  "contain", "contains", "containing", "content", "contents",
  "defendant", "defendants", "during", "every", "except",
  "from", "inside", "item", "items", "label", "labels", "labeled",
  "large", "lawsuit", "lawsuits", "level", "levels", "medium",
  "member", "members", "model", "models", "offer", "offers", "online",
  "order", "orders", "original", "other", "over",
  "package", "packages", "packaging", "plaintiff", "plaintiffs",
  "plastic", "plastics", "premium", "price", "prices",
  "product", "products", "regular", "retail", "series", "settle",
  "settled", "settlement", "settlements", "size", "small", "speed",
  "standard", "store", "stores", "super", "their", "these", "those",
  "through", "under", "until", "ultra", "with", "where", "which",
  "while", "would",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

// Whole-word membership test. Avoids substring false positives like "case"
// matching inside "staircase" or "comcast" matching "comcastic".
function hasWholeWord(haystack: string, word: string): boolean {
  if (!word) return false;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i").test(haystack);
}

interface CatalogMatch {
  matchedOn: string[];
}

/**
 * Strict + simple match rule:
 *   A settlement matches a user's cart IFF a distinctive brand token from the
 *   settlement's defendant or title appears as a whole word in at least one
 *   user product name.
 *
 * Rationale: the defendant IS the brand, and brand overlap is what actually
 * makes a claim valid. Anything looser (eligible_products substring, chemical
 * similarity, category heuristics) produced the Comcast↔food false positive.
 * If no brand overlap exists, returning zero matches is the correct answer.
 */
function classifyCatalogRow(row: Record<string, unknown>, userProducts: string[]): CatalogMatch | null {
  const defendantRaw = String(row.defendant ?? "").toLowerCase();
  const titleRaw = String(row.title ?? "").toLowerCase();
  if (!userProducts.length) return null;

  const brandTokens = new Set<string>([
    ...tokenize(defendantRaw),
    ...tokenize(titleRaw),
  ]);
  if (brandTokens.size === 0) return null;

  const matchedOn: string[] = [];
  for (const product of userProducts) {
    const productLower = product.toLowerCase();
    for (const brand of brandTokens) {
      if (hasWholeWord(productLower, brand)) {
        matchedOn.push(product);
        break;
      }
    }
  }

  if (matchedOn.length === 0) return null;
  return { matchedOn: Array.from(new Set(matchedOn)) };
}

function buildLawsuitRow(row: Record<string, unknown>, match: CatalogMatch): Record<string, unknown> {
  const payout = row.payout_estimate != null ? String(row.payout_estimate) : "Unknown";
  const tiers = Array.isArray(row.payout_tiers) && (row.payout_tiers as unknown[]).length
    ? row.payout_tiers
    : [{ tier: "Standard", amount: payout, requirement: "See claim site" }];

  return {
    id: row.id,
    title: String(row.title ?? ""),
    defendant: String(row.defendant ?? ""),
    settlementAmount: payout,
    deadline: row.deadline != null ? String(row.deadline) : "TBD",
    status: String(row.status ?? "active"),
    matchType: "product",
    matchedOn: match.matchedOn,
    matchedChemicals: Array.isArray(row.chemicals_involved)
      ? (row.chemicals_involved as unknown[]).map(String).filter(Boolean)
      : [],
    matchedProducts: match.matchedOn,
    description: `You bought ${match.matchedOn[0]} — listed among this settlement's covered products.`,
    payoutTiers: tiers,
    claimUrl: typeof row.claim_url === "string" && row.claim_url ? row.claim_url : undefined,
  };
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    const { products } = await req.json();
    const userProducts: string[] = Array.isArray(products)
      ? (products as unknown[]).map(String).filter((s) => s && s !== "Unknown Product")
      : [];

    if (!userProducts.length) {
      return corsJson({ lawsuits: [] });
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
      `[match] ${userProducts.length} products, catalog size: ${openCatalog.length} (deduped from ${dateFiltered.length}, original ${originalCatalogSize})`,
    );

    if (openCatalog.length === 0) {
      return corsJson({ lawsuits: [], _provider: "strict_brand_match" });
    }

    const matched: Record<string, unknown>[] = [];
    for (const row of openCatalog) {
      const m = classifyCatalogRow(row, userProducts);
      if (m) matched.push(buildLawsuitRow(row, m));
    }

    console.log(`[match] SUCCESS strict brand matches: ${matched.length}`);

    return corsJson({
      lawsuits: matched.slice(0, 8),
      _provider: "strict_brand_match",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[match] CRASH:", msg);
    if (error instanceof Error && error.stack) {
      console.error("[match] CRASH stack:", error.stack);
    }
    let hint =
      "Open this response JSON `error` field and Supabase Edge Function logs for match-opportunities.";
    if (msg.includes("SUPABASE_URL") || msg.includes("SERVICE_ROLE")) {
      hint = "Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for edge functions.";
    }
    return corsJson({ error: msg, hint }, { status: 500 });
  }
});
