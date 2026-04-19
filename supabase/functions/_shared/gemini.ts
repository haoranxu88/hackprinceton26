/**
 * Shared Gemini helpers for LegalRedress Edge Functions.
 *
 * All calls go through `callGemini` so we get one place to tune retries,
 * thinking budget, token limits, and rate-limit backoff.
 */

interface GeminiPart {
  text?: string;
  thought?: boolean;
}

interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

/**
 * Pull the final assistant text out of a Gemini response, skipping any
 * `thought` parts that can appear on 2.5-series "thinking" models.
 */
export function extractGeminiText(data: unknown): string {
  const parts = (data as GeminiResponse).candidates?.[0]?.content?.parts;
  if (!parts?.length) throw new Error("Empty Gemini response");

  const contentPart = parts.filter((p) => !p.thought).pop();
  if (contentPart?.text) return contentPart.text;

  const last = parts[parts.length - 1];
  if (last?.text) return last.text;

  throw new Error("No text in Gemini response");
}

export interface GeminiOptions {
  temperature?: number;
  maxOutputTokens?: number;
  retries?: number;
  /** Prefix used for rate-limit / retry log lines (e.g. "analyze", "match"). */
  label?: string;
}

/**
 * Single-prompt Gemini call with backoff on 429 and transient 5xx.
 * Model: `GEMINI_MODEL` env, else `gemini-3.1-flash-lite-preview` (Google’s listed id for 3.1 Flash-Lite preview).
 */
export async function callGemini(prompt: string, opts: GeminiOptions = {}): Promise<string> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY not configured");

  const {
    temperature = 0.2,
    maxOutputTokens = 16384,
    retries = 3,
    label = "gemini",
  } = opts;

  const modelId = Deno.env.get("GEMINI_MODEL")?.trim() || "gemini-3.1-flash-lite-preview";
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens,
        },
      }),
    });

    const text = await resp.text();

    if (resp.status === 429 && attempt < retries) {
      const waitMs = attempt * 2000;
      console.log(`[${label}] Rate limited, waiting ${waitMs / 1000}s before retry ${attempt + 1}...`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    if ((resp.status === 503 || resp.status === 500 || resp.status === 502) && attempt < retries) {
      const waitMs = attempt * 1500;
      console.log(
        `[${label}] Gemini ${resp.status}, waiting ${waitMs / 1000}s before retry ${attempt + 1}...`,
      );
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    if (!resp.ok) {
      throw new Error(`Gemini ${resp.status}: ${text.slice(0, 400)}`);
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Gemini returned non-JSON body (first 200 chars): ${text.slice(0, 200)}`);
    }
    return extractGeminiText(data);
  }

  throw new Error("Gemini max retries exceeded");
}

/**
 * Parse a possibly-truncated JSON payload returned by the model.
 * Strips ``` fences, then tries to balance open braces / brackets and
 * trim trailing commas so partial responses still yield *something* usable.
 */
export function parseJsonWithRepair<T = Record<string, unknown>>(
  rawText: string,
  label = "json",
): T {
  let clean = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    return JSON.parse(clean) as T;
  } catch (err) {
    console.log(`[${label}] JSON parse failed, repairing:`, (err as Error).message);

    const lastComplete = clean.lastIndexOf("},");
    if (lastComplete > 0) clean = clean.slice(0, lastComplete + 1);
    clean = clean.replace(/,\s*$/, "");

    const openBraces = (clean.match(/{/g) || []).length;
    const closeBraces = (clean.match(/}/g) || []).length;
    const openBrackets = (clean.match(/\[/g) || []).length;
    const closeBrackets = (clean.match(/\]/g) || []).length;

    for (let i = 0; i < openBrackets - closeBrackets; i++) clean += "]";
    for (let i = 0; i < openBraces - closeBraces; i++) clean += "}";

    return JSON.parse(clean) as T;
  }
}

/**
 * Strip <script>, <style>, comments, then truncate HTML so it fits
 * in a reasonable Gemini prompt window.
 */
export function stripHtmlForLLM(html: string, maxLen = 120_000): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .slice(0, maxLen);
}

/** Standard scraper User-Agent so remote logs can attribute the traffic. */
export async function fetchHtml(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; LegalRedressAI/1.0; +https://example.com)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!r.ok) throw new Error(`Fetch ${url} failed: ${r.status}`);
  return await r.text();
}
