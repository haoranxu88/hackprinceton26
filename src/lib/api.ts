import { supabase } from "@/integrations/supabase/client";

/**
 * Thin wrapper around Supabase Edge Functions.
 * - Guarantees an anonymous session before invoking (functions require JWT).
 * - Surfaces structured error bodies when the function returns a non-2xx.
 * - Logging is minimal in production; set VITE_DEBUG_API=true to get full traces.
 */

const DEBUG = import.meta.env.VITE_DEBUG_API === "true";

const knotApiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function parseJsonOrThrow(response: Response) {
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.error || data?.message || `Request failed with ${response.status}`;
    throw new Error(message);
  }
  return data;
}

async function ensureAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.error("[api] Anonymous auth failed:", error.message);
    return null;
  }
  return data.session;
}

async function invokeEdgeFunction<T = unknown>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  await ensureAuth();

  if (DEBUG) console.log(`[api] Invoking ${functionName}`, JSON.stringify(body).slice(0, 200));
  const { data, error } = await supabase.functions.invoke(functionName, { body });

  if (error) {
    let errorDetail: unknown = null;
    try {
      const ctx = (error as { context?: { json?: () => Promise<unknown>; text?: () => Promise<string> } }).context;
      if (ctx?.json) errorDetail = await ctx.json();
      else if (ctx?.text) errorDetail = await ctx.text();
    } catch { /* swallow */ }

    console.error(`[api] ${functionName} error:`, error);
    if (errorDetail) console.error(`[api] ${functionName} detail:`, errorDetail);
    throw error;
  }

  if (DEBUG) console.log(`[api] ${functionName} success:`, JSON.stringify(data).slice(0, 300));
  return data as T;
}

// ---------- Knot (TransactionLink) ----------

export async function createKnotTransactionLinkSession(userId: string) {
  const response = await fetch(`${knotApiBaseUrl}/api/knot/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });

  return parseJsonOrThrow(response);
}

export async function listKnotTransactionLinkMerchants() {
  const response = await fetch(`${knotApiBaseUrl}/api/knot/merchants?platform=web`);
  return parseJsonOrThrow(response);
}

export async function getKnotBackendStatus() {
  const response = await fetch(`${knotApiBaseUrl}/api/knot/status`);
  return parseJsonOrThrow(response);
}

export async function listKnotMerchants() {
  return invokeEdgeFunction("knot-proxy", { action: "list-merchants" });
}

export async function linkKnotAccount(userId: string, merchantId: number) {
  return invokeEdgeFunction("knot-proxy", { action: "link-account", userId, merchantId });
}

export async function syncKnotTransactions(userId: string, merchantId: number) {
  return invokeEdgeFunction("knot-proxy", { action: "sync-transactions", userId, merchantId });
}

// ---------- AI analysis ----------

export async function analyzeExposure(products: { name: string; description: string }[]) {
  return invokeEdgeFunction("analyze-exposure", { products });
}

export async function matchOpportunities(chemicals: string[]) {
  return invokeEdgeFunction("match-opportunities", { chemicals });
}

// ---------- Settlement pipeline ----------

/** Manual kick: run discover then enrich. Cron runs these automatically every 4h / 1h. */
export async function scrapeSettlements() {
  return invokeEdgeFunction("scrape-settlements", {});
}

/** Alternate LLM provider (Dedalus, OpenAI-compatible). Drop-in swap if Gemini is down. */
export async function dedalusAgent(task: "analyze" | "match", data: Record<string, unknown>) {
  return invokeEdgeFunction("dedalus-agent", { task, data });
}

/**
 * Send a receipt email via Resend.
 * @param image  - A public image URL or base64 data URL (e.g. "data:image/png;base64,...")
 * @param userName - Recipient's display name
 * @param emailId  - Recipient's email address
 */
export async function sendReceiptEmail(image: string, userName: string, emailId: string) {
  return invokeEdgeFunction("send-receipt-email", { image, userName, emailId });
}
