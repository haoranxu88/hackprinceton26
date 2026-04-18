
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const clientId = Deno.env.get("KNOT_CLIENT_ID");
    const secret = Deno.env.get("KNOT_SECRET");

    if (!clientId || !secret) {
      console.error("Missing credentials. KNOT_CLIENT_ID:", !!clientId, "KNOT_SECRET:", !!secret);
      throw new Error("KNOT_CLIENT_ID or KNOT_SECRET not configured");
    }

    // Base64 encode credentials for Basic Auth per Knot docs
    const credentials = `${clientId}:${secret}`;
    const base64Credentials = btoa(credentials);
    const authHeader = `Basic ${base64Credentials}`;

    const baseUrl = "https://development.knotapi.com";
    const body = await req.json();
    const { action, userId, merchantId, cursor, limit } = body;

    console.log("knot-proxy called with action:", action, "userId:", userId);

    let response;

    switch (action) {
      case "create-session": {
        console.log("Creating Knot session for user:", userId);
        response = await fetch(`${baseUrl}/session/create`, {
          method: "POST",
          headers: {
            "Authorization": authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "transaction_link",
            external_user_id: userId || `vigilant-${Date.now()}`,
          }),
        });
        break;
      }

      case "link-account": {
        console.log("Linking account for user:", userId, "merchant:", merchantId);
        response = await fetch(`${baseUrl}/development/accounts/link`, {
          method: "POST",
          headers: {
            "Authorization": authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            external_user_id: userId,
            merchant_id: merchantId || 19,
          }),
        });
        break;
      }

      case "sync-transactions": {
        console.log("Syncing transactions for user:", userId, "merchant:", merchantId);
        response = await fetch(`${baseUrl}/transactions/sync`, {
          method: "POST",
          headers: {
            "Authorization": authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            merchant_id: merchantId || 19,
            external_user_id: userId,
            cursor: cursor || undefined,
            limit: limit || 50,
          }),
        });
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const data = await response.json();
    console.log(`Knot ${action} response status:`, response.status, "data:", JSON.stringify(data).slice(0, 200));

    if (!response.ok) {
      console.error("Knot API error:", JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: data.message || "Knot API error", details: data }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("knot-proxy error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
