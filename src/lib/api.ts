import { supabase } from "@/integrations/supabase/client";

async function ensureAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    console.log("[api] Session exists, user:", session.user.id);
    return session;
  }

  console.log("[api] No session, signing in anonymously...");
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.error("[api] Anonymous auth failed:", error.message);
    return null;
  }
  console.log("[api] Anonymous auth success, user:", data.user?.id);
  return data.session;
}

async function invokeEdgeFunction(functionName: string, body: Record<string, unknown>) {
  const session = await ensureAuth();

  if (session) {
    console.log("[api] Invoking", functionName, "via supabase client");
    const { data, error } = await supabase.functions.invoke(functionName, { body });
    if (error) {
      console.error("[api] Function error:", functionName, error);
      throw new Error(error.message || `Failed to call ${functionName}`);
    }
    return data;
  }

  // Last resort: direct fetch with anon key
  console.log("[api] No session available, using direct fetch for", functionName);
  const supabaseUrl = (supabase as unknown as { supabaseUrl: string }).supabaseUrl 
    || "https://spb-t4nkwkku7o35ql80.supabase.opentrust.net";
  const supabaseKey = (supabase as unknown as { supabaseKey: string }).supabaseKey
    || "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiIsInJlZiI6InNwYi10NG5rd2trdTdvMzVxbDgwIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzY0MzA0OTYsImV4cCI6MjA5MjAwNjQ5Nn0.u5RWut413GXanR6MCWaYfCFufrfV-t2RFvotrnlUk1A";
  
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": supabaseKey,
      "Authorization": `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[api] Direct fetch ${functionName} error:`, response.status, errText);
    throw new Error(`Edge Function error: ${response.status} - ${errText}`);
  }

  return response.json();
}

export async function createKnotSession(userId: string) {
  return invokeEdgeFunction("knot-proxy", { action: "create-session", userId });
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
