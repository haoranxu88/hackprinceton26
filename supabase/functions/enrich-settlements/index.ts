import { corsJson, handlePreflight } from "../_shared/cors.ts";
import { callGemini, fetchHtml, parseJsonWithRepair, stripHtmlForLLM } from "../_shared/gemini.ts";
import { getServiceClient } from "../_shared/supabase.ts";

/**
 * POST /enrich-settlements
 *
 * Pulls up to BATCH pending stubs (and stale enriched rows) from `settlements`,
 * fetches their detail pages, asks Gemini to extract structured data,
 * and writes it back. Stubs with >=3 failed attempts get flagged `failed`.
 *
 * Scheduled by pg_cron; safe to invoke manually from `scrape-settlements`.
 */

const BATCH = 5;
const STALE_MS = 30 * 24 * 60 * 60 * 1000; // refresh enriched rows after 30 days

async function callGeminiEnrich(
  htmlChunk: string,
  detailUrl: string,
): Promise<Record<string, unknown> | null> {
  const prompt = `You extract ONE structured class action settlement record from a single detail HTML page.

Detail page URL: ${detailUrl}

HTML (truncated):
${htmlChunk}

Return ONLY valid JSON (no markdown, no code fences) in this exact shape:
{"settlements":[
  {
    "defendant":"primary company or defendants string",
    "title":"short human-readable settlement title",
    "product_category":"e.g. cosmetics, sunscreen, dry shampoo, baby powder",
    "eligible_products":"comma-separated keywords for SKU matching (brands, product types)",
    "chemicals_involved":["lowercase tokens like benzene","talc"],
    "deadline":"YYYY-MM-DD or TBD or empty string",
    "payout_estimate":"visible fund size or per-claim range from the page; use Unknown if not stated",
    "proof_required":true or false,
    "claim_url":"absolute https URL copied from the HTML only; empty string if none found",
    "payout_tiers":[{"tier":"string","amount":"string","requirement":"string"}]
  }
]}

Rules:
- Return at most one object in "settlements" (the main settlement for this page).
- chemicals_involved: use [] if none mentioned.
- Do NOT invent claim_url; only use URLs that appear in the HTML snippet.
- payout_tiers may be [] if not broken out on the page.
- Be conservative; prefer Unknown over guessing amounts.`;

  const raw = await callGemini(prompt, {
    label: "enrich",
    temperature: 0.1,
    maxOutputTokens: 8192,
  });
  const parsed = parseJsonWithRepair<{ settlements?: unknown[] }>(raw, "enrich");
  const arr = Array.isArray(parsed.settlements) ? parsed.settlements : [];
  const first = arr[0];
  if (!first || typeof first !== "object") return null;
  return first as Record<string, unknown>;
}

function buildUpdateFromExtract(extracted: Record<string, unknown>): Record<string, unknown> {
  const chemicals = Array.isArray(extracted.chemicals_involved)
    ? (extracted.chemicals_involved as unknown[])
      .map((c) => String(c).toLowerCase().trim())
      .filter(Boolean)
    : [];

  const payoutTiers = Array.isArray(extracted.payout_tiers) ? extracted.payout_tiers : [];

  return {
    defendant: String(extracted.defendant || "").trim(),
    title: String(extracted.title || "").trim(),
    product_category: extracted.product_category != null ? String(extracted.product_category) : null,
    eligible_products: extracted.eligible_products != null ? String(extracted.eligible_products) : "",
    chemicals_involved: chemicals,
    deadline: extracted.deadline != null ? String(extracted.deadline) : "TBD",
    payout_estimate: extracted.payout_estimate != null ? String(extracted.payout_estimate) : "Unknown",
    proof_required: Boolean(extracted.proof_required),
    claim_url: extracted.claim_url != null ? String(extracted.claim_url) : "",
    status: "active",
    payout_tiers: payoutTiers,
    scraped_at: new Date().toISOString(),
    enrichment_status: "enriched",
    last_enriched_at: new Date().toISOString(),
    enrichment_attempts: 0,
  };
}

type SettlementRow = {
  id: string;
  detail_url: string | null;
  enrichment_status: string | null;
  enrichment_attempts: number | null;
  defendant: string;
  title: string;
};

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    const supabase = getServiceClient();
    const staleBefore = new Date(Date.now() - STALE_MS).toISOString();

    const { data: pendingRows, error: pendingErr } = await supabase
      .from("settlements")
      .select("id,detail_url,enrichment_status,enrichment_attempts,defendant,title")
      .eq("enrichment_status", "pending")
      .lt("enrichment_attempts", 3)
      .not("detail_url", "is", null)
      .order("discovered_at", { ascending: true })
      .limit(BATCH);

    if (pendingErr) throw new Error(pendingErr.message);

    const queue: SettlementRow[] = [...(pendingRows as SettlementRow[] ?? [])];
    const need = BATCH - queue.length;

    if (need > 0) {
      const { data: staleRows, error: staleErr } = await supabase
        .from("settlements")
        .select("id,detail_url,enrichment_status,enrichment_attempts,defendant,title")
        .eq("enrichment_status", "enriched")
        .not("detail_url", "is", null)
        .lt("last_enriched_at", staleBefore)
        .order("last_enriched_at", { ascending: true })
        .limit(need);

      if (staleErr) throw new Error(staleErr.message);
      queue.push(...(staleRows as SettlementRow[] ?? []));
    }

    const results: { id: string; ok: boolean; error?: string }[] = [];

    for (const row of queue) {
      const detailUrl = row.detail_url;
      if (!detailUrl) {
        results.push({ id: row.id, ok: false, error: "missing detail_url" });
        continue;
      }

      try {
        const html = await fetchHtml(detailUrl);
        const chunk = stripHtmlForLLM(html);
        const extracted = await callGeminiEnrich(chunk, detailUrl);
        if (!extracted) throw new Error("empty extraction");

        const patch = buildUpdateFromExtract(extracted);
        if (!patch.defendant || !patch.title) {
          throw new Error("extraction missing defendant/title");
        }

        const { error: upErr } = await supabase.from("settlements").update(patch).eq("id", row.id);
        if (upErr) throw new Error(upErr.message);
        results.push({ id: row.id, ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[enrich] row failed", row.id, msg);

        if (row.enrichment_status === "pending") {
          const attempts = (row.enrichment_attempts ?? 0) + 1;
          const failed = attempts >= 3;
          await supabase
            .from("settlements")
            .update({
              enrichment_attempts: attempts,
              enrichment_status: failed ? "failed" : "pending",
            })
            .eq("id", row.id);
        } else {
          // Stale refresh: keep enriched; bump last_enriched_at so we do not hammer the same URL hourly
          await supabase
            .from("settlements")
            .update({ last_enriched_at: new Date().toISOString() })
            .eq("id", row.id);
        }
        results.push({ id: row.id, ok: false, error: msg });
      }
    }

    return corsJson({ ok: true, processed: results.length, results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[enrich] CRASH:", msg);
    return corsJson({ error: msg }, { status: 500 });
  }
});
