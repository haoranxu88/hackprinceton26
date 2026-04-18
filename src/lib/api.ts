import { supabase } from "@/integrations/supabase/client";

export async function createKnotSession(userId: string) {
  const { data, error } = await supabase.functions.invoke("knot-proxy", {
    body: { action: "create-session", userId },
  });
  if (error) throw new Error(error.message || "Failed to create Knot session");
  return data;
}

export async function linkKnotAccount(userId: string, merchantId: number) {
  const { data, error } = await supabase.functions.invoke("knot-proxy", {
    body: { action: "link-account", userId, merchantId },
  });
  if (error) throw new Error(error.message || "Failed to link account");
  return data;
}

export async function syncKnotTransactions(userId: string, merchantId: number) {
  const { data, error } = await supabase.functions.invoke("knot-proxy", {
    body: { action: "sync-transactions", userId, merchantId },
  });
  if (error) throw new Error(error.message || "Failed to sync transactions");
  return data;
}

export async function analyzeExposure(products: { name: string; description: string }[]) {
  const { data, error } = await supabase.functions.invoke("analyze-exposure", {
    body: { products },
  });
  if (error) throw new Error(error.message || "Failed to analyze exposure");
  return data;
}

export async function matchOpportunities(chemicals: string[]) {
  const { data, error } = await supabase.functions.invoke("match-opportunities", {
    body: { chemicals },
  });
  if (error) throw new Error(error.message || "Failed to match opportunities");
  return data;
}
