import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * Service-role Supabase client for Edge Functions. Bypasses RLS.
 * Never expose this to the browser.
 */
export function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured");
  }
  return createClient(url, key);
}
