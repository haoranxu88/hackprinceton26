import { supabase } from "@/integrations/supabase/client";

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

  console.log("[api] No session, signing in anonymously...");
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.error("[api] Anonymous auth failed:", error.message);
    return null;
  }
  return data.session;
}

async function invokeEdgeFunction(functionName: string, body: Record<string, unknown>) {
  await ensureAuth();

  console.log(`[api] Invoking ${functionName}`, JSON.stringify(body).slice(0, 200));
  const { data, error } = await supabase.functions.invoke(functionName, { body });

  if (error) {
    // Try to extract the response body from the error context
    let errorDetail = null;
    try {
      if (error.context && typeof error.context.json === "function") {
        errorDetail = await error.context.json();
      } else if (error.context && typeof error.context.text === "function") {
        errorDetail = await error.context.text();
      }
    } catch (_) { /* ignore */ }
    
    console.error(`[api] ${functionName} error:`, error);
    console.error(`[api] ${functionName} error detail:`, errorDetail ?? data ?? "no detail");
    throw error;
  }

  console.log(`[api] ${functionName} success:`, JSON.stringify(data).slice(0, 300));
  return data;
}

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

export async function analyzeExposure(products: { name: string; description: string }[]) {
  return invokeEdgeFunction("analyze-exposure", { products });
}

export async function matchOpportunities(chemicals: string[]) {
  return invokeEdgeFunction("match-opportunities", { chemicals });
}

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
