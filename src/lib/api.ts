import { supabase } from "@/integrations/supabase/client";

/**
 * Thin wrapper around Supabase Edge Functions.
 * - Guarantees an anonymous session before invoking (functions require JWT).
 * - Surfaces structured error bodies when the function returns a non-2xx.
 * - Logging is minimal in production; set VITE_DEBUG_API=true to get full traces.
 */

const DEBUG = import.meta.env.VITE_DEBUG_API === "true";

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

export interface KnotStatusResponse {
  ok: boolean;
  hasClientId: boolean;
  clientId: string | null;
  environment: string;
}

export interface KnotMerchant {
  id: number;
  name: string;
  min_sdk_version?: string;
  [key: string]: unknown;
}

export interface KnotMerchantsResponse {
  merchants: KnotMerchant[];
  platform: string;
}

export interface KnotSessionResponse {
  sessionId: string;
  clientId: string;
  environment: string;
  externalUserId: string;
}

export interface KnotSyncResponse {
  transactions: unknown[];
  merchant: unknown;
  count: number;
  /** Total rows in knot_transactions for this user+merchant after the sync. */
  total?: number;
}

export interface KnotAccountRow {
  external_user_id: string;
  merchant_id: number;
  merchant_name: string | null;
  connection_status: "connected" | "disconnected" | string;
  last_authenticated_at: string | null;
  last_synced_at: string | null;
  transaction_count: number | null;
}

export interface KnotAccountsResponse {
  accounts: KnotAccountRow[];
}

export interface KnotTransactionRow {
  id: string;
  external_user_id: string;
  merchant_id: number;
  merchant_name: string | null;
  external_id: string | null;
  datetime: string;
  order_status: string;
  url: string | null;
  price_total: string;
  price_sub_total: string | null;
  price_currency: string | null;
  products: unknown;
  payment_methods: unknown;
  shipping: unknown;
  raw: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface KnotTransactionsResponse {
  transactions: KnotTransactionRow[];
  count: number;
}

export async function getKnotBackendStatus() {
  return invokeEdgeFunction<KnotStatusResponse>("knot-proxy", { action: "status" });
}

export async function listKnotTransactionLinkMerchants(platform: string = "web") {
  return invokeEdgeFunction<KnotMerchantsResponse>("knot-proxy", {
    action: "list-merchants",
    platform,
  });
}

export async function createKnotTransactionLinkSession(userId: string) {
  return invokeEdgeFunction<KnotSessionResponse>("knot-proxy", {
    action: "create-session",
    userId,
  });
}

export async function syncKnotTransactions(userId: string, merchantId: number, limit: number = 100) {
  return invokeEdgeFunction<KnotSyncResponse>("knot-proxy", {
    action: "sync-transactions",
    userId,
    merchantId,
    limit,
  });
}

/** Read webhook-populated connection status for every merchant linked by this user. */
export async function getKnotAccounts(userId: string) {
  return invokeEdgeFunction<KnotAccountsResponse>("knot-proxy", {
    action: "get-accounts",
    userId,
  });
}

/**
 * Read webhook-populated transactions. Optionally filter by merchant.
 * This is what the UI polls while it waits for Knot to finish a sync.
 */
export async function getKnotTransactions(
  userId: string,
  merchantId?: number,
  limit: number = 500,
) {
  return invokeEdgeFunction<KnotTransactionsResponse>("knot-proxy", {
    action: "get-transactions",
    userId,
    ...(merchantId !== undefined ? { merchantId } : {}),
    limit,
  });
}

// ---------- AI analysis ----------

export async function analyzeExposure(products: { name: string; description: string }[]) {
  return invokeEdgeFunction("analyze-exposure", { products });
}

export async function matchOpportunities(chemicals: string[]) {
  return invokeEdgeFunction("match-opportunities", { chemicals });
}

export async function getChemicalHealthEffects(chemicals: string[]) {
  return invokeEdgeFunction<{ effects: { chemical: string; conditions: string[] }[] }>(
    "chemical-health-effects",
    { chemicals }
  );
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

export interface SendClaimReceiptEmailItem {
  name: string;
  external_id?: string;
  quantity?: number;
  unit_price?: string | number;
  total_price?: string | number;
}

export interface SendClaimReceiptEmailPayload {
  emailId: string;
  lawsuitTitle: string;
  lawsuitDefendant?: string;
  lawsuitClaimUrl?: string;
  merchant: string;
  transactionId: string;
  transactionDate: string;
  matchedItems: SendClaimReceiptEmailItem[];
  allItems: SendClaimReceiptEmailItem[];
  /** Plain base64 (no data URI prefix) of the PDF to attach. */
  pdfBase64: string;
  pdfFileName?: string;
  userName?: string;
}

/**
 * Send a claim-receipt email via Resend with the generated PDF attached.
 * Edge function: `send-receipt-email`. Requires RESEND_API_KEY to be set on the function.
 */
export async function sendClaimReceiptEmail(payload: SendClaimReceiptEmailPayload) {
  return invokeEdgeFunction("send-receipt-email", payload as unknown as Record<string, unknown>);
}
