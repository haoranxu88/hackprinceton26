import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = "https://spb-t4nkwkku7o35ql80.supabase.opentrust.net";
const SUPABASE_ANON_KEY = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiIsInJlZiI6InNwYi10NG5rd2trdTdvMzVxbDgwIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzY0MzA0OTYsImV4cCI6MjA5MjAwNjQ5Nn0.u5RWut413GXanR6MCWaYfCFufrfV-t2RFvotrnlUk1A";

async function invokeEdgeFunction(functionName: string, body: Record<string, unknown>) {
  // Try supabase client first (if user has a valid session)
  const { data: { session } } = await supabase.auth.getSession();
  
  if (session?.access_token) {
    const { data, error } = await supabase.functions.invoke(functionName, { body });
    if (error) throw new Error(error.message || `Failed to call ${functionName}`);
    return data;
  }

  // Fallback: direct fetch with anon key
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`Edge function ${functionName} error:`, response.status, errText);
    throw new Error(`Edge Function error: ${response.status}`);
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
