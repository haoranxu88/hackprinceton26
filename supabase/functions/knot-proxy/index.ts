
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
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
    const base64Credentials = btoa(`${clientId}:${secret}`);
    const authHeader = `Basic ${base64Credentials}`;
    const baseUrl = "https://development.knotapi.com";

    const body = await req.json();
    const { action, userId, merchantId, cursor, limit } = body;
    console.log("knot-proxy called:", JSON.stringify({ action, userId, merchantId }));

    let url: string;
    let requestBody: Record<string, unknown>;

    switch (action) {
      case "create-session": {
        url = `${baseUrl}/session/create`;
        requestBody = {
          type: "transaction_link",
          external_user_id: userId || `vigilant-${Date.now()}`,
        };
        break;
      }

      case "link-account": {
        url = `${baseUrl}/development/accounts/link`;
        // For TransactionLink, pass the transactions object to generate sample data
        requestBody = {
          external_user_id: userId,
          merchant_id: merchantId || 19,
          transactions: {
            count: 10,
          },
        };
        break;
      }

      case "sync-transactions": {
        url = `${baseUrl}/transactions/sync`;
        requestBody = {
          merchant_id: merchantId || 19,
          external_user_id: userId,
          limit: limit || 50,
        };
        if (cursor) {
          requestBody.cursor = cursor;
        }
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    console.log(`Knot ${action} -> ${url}`);
    console.log("Request body:", JSON.stringify(requestBody));

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    console.log(`Knot ${action} status:`, response.status);
    console.log(`Knot ${action} response:`, responseText.slice(0, 500));

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw: responseText };
    }

    if (!response.ok) {
      console.error("Knot API error:", response.status, responseText);
      return new Response(
        JSON.stringify({ error: data.message || `Knot API error ${response.status}`, details: data }),
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
