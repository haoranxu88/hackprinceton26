import { corsJson, handlePreflight } from "../_shared/cors.ts";
import { callGemini, fetchHtml, parseJsonWithRepair, stripHtmlForLLM } from "../_shared/gemini.ts";
import { getServiceClient } from "../_shared/supabase.ts";

/**
 * POST /discover-settlements
 *
 * Scrapes class-action index pages and inserts lightweight stubs
 * (title + defendant + detail_url) into `settlements`.
 * Enrichment (deadlines, payout tiers, claim URLs) is handled by the
 * separate `enrich-settlements` function so index scraping stays cheap.
 *
 * Scheduled by pg_cron; safe to invoke manually from `scrape-settlements`.
 */

async function callGeminiDiscover(htmlChunk: string, sourceLabel: string): Promise<unknown[]> {
  const prompt = `You extract links to individual class action settlement pages from an index/listing HTML page.

Source: ${sourceLabel}

HTML (truncated):
${htmlChunk}

Return ONLY valid JSON (no markdown, no code fences) in this exact shape:
{"items":[
  {"title":"string","defendant":"primary company or defendants","detail_url":"absolute https URL to the settlement detail page from the HTML only"}
]}

Rules:
- Max 25 items. Only real settlements clearly linked in the HTML.
- detail_url MUST be a full https URL copied from href attributes in the HTML; never invent URLs.
- Skip duplicates (same detail_url).
- If no suitable links, return {"items":[]}.`;

  const raw = await callGemini(prompt, {
    label: "discover",
    temperature: 0.1,
    maxOutputTokens: 4096,
  });
  const parsed = parseJsonWithRepair<{ items?: unknown[] }>(raw, "discover");
  return Array.isArray(parsed.items) ? parsed.items : [];
}

function buildIndexPages(): { label: string; url: string }[] {
  const pages: { label: string; url: string }[] = [];
  for (let p = 1; p <= 5; p++) {
    const url = p === 1
      ? "https://www.classaction.org/settlements"
      : `https://www.classaction.org/settlements?page=${p}`;
    pages.push({ label: `ClassAction.org (page ${p})`, url });
  }
  for (let p = 1; p <= 5; p++) {
    const url = p === 1
      ? "https://topclassactions.com/category/open-lawsuit-settlements/"
      : `https://topclassactions.com/category/open-lawsuit-settlements/page/${p}/`;
    pages.push({ label: `TopClassActions.com (page ${p})`, url });
  }
  return pages;
}

async function idFromDetailUrl(detailUrl: string): Promise<string> {
  const enc = new TextEncoder().encode(detailUrl);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `s-${hex}`;
}

function normalizeDetailUrl(raw: string): string | null {
  const u = String(raw || "").trim();
  if (!u.startsWith("https://")) return null;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    const supabase = getServiceClient();

    let inserted = 0;
    let skipped = 0;
    const sources: { label: string; found: number; newRows: number; error?: string }[] = [];

    for (const { label, url: pageUrl } of buildIndexPages()) {
      try {
        const html = await fetchHtml(pageUrl);
        const chunk = stripHtmlForLLM(html);
        const extracted = await callGeminiDiscover(chunk, `${label} (${pageUrl})`);
        let newForPage = 0;

        for (const raw of extracted) {
          if (!raw || typeof raw !== "object") continue;
          const row = raw as Record<string, unknown>;
          const title = String(row.title || "").trim();
          const defendant = String(row.defendant || "").trim();
          const detailUrl = normalizeDetailUrl(String(row.detail_url || ""));
          if (!title || !defendant || !detailUrl) continue;

          const id = await idFromDetailUrl(detailUrl);
          const stub = {
            id,
            defendant,
            title,
            detail_url: detailUrl,
            source_url: pageUrl,
            product_category: null,
            eligible_products: "",
            chemicals_involved: [] as string[],
            deadline: "TBD",
            payout_estimate: "Pending enrichment",
            proof_required: false,
            claim_url: "",
            status: "active",
            payout_tiers: [] as unknown[],
            scraped_at: new Date().toISOString(),
            discovered_at: new Date().toISOString(),
            enrichment_status: "pending",
            enrichment_attempts: 0,
            last_enriched_at: null as string | null,
          };

          const { error } = await supabase.from("settlements").insert(stub);
          if (error) {
            if (error.code === "23505" || error.message?.toLowerCase().includes("duplicate")) {
              skipped++;
              continue;
            }
            console.error("[discover] insert error", detailUrl, error.message);
            continue;
          }
          inserted++;
          newForPage++;
        }

        sources.push({ label, found: extracted.length, newRows: newForPage });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[discover] page failed", label, msg);
        sources.push({ label, found: 0, newRows: 0, error: msg });
      }
    }

    return corsJson({ ok: true, inserted, skippedDuplicate: skipped, sources });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[discover] CRASH:", msg);
    return corsJson({ error: msg }, { status: 500 });
  }
});
