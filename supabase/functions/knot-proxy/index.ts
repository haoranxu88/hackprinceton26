
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
      throw new Error("KNOT_CLIENT_ID or KNOT_SECRET not configured");
    }

    const base64Credentials = btoa(`${clientId}:${secret}`);
    const authHeader = `Basic ${base64Credentials}`;
    const baseUrl = "https://development.knotapi.com";

    const body = await req.json();
    const { action, userId, merchantId, cursor, limit } = body;
    console.log("[knot] action:", action, "userId:", userId, "merchantId:", merchantId);

    let url: string;
    let requestBody: Record<string, unknown>;

    switch (action) {
      case "list-merchants": {
        url = `${baseUrl}/merchant/list`;
        requestBody = { type: "transaction_link" };
        break;
      }

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
        requestBody = {
          external_user_id: userId,
          merchant_id: merchantId || 19,
          transactions: { new: true },
        };
        break;
      }

      case "sync-transactions": {
        // Poll for transactions since they're generated async after link-account
        url = `${baseUrl}/transactions/sync`;
        const syncLimit = limit || 50;
        const maxAttempts = 6;
        const delayMs = 3000;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const syncBody: Record<string, unknown> = {
            merchant_id: merchantId || 19,
            external_user_id: userId,
            limit: syncLimit,
          };
          if (cursor) syncBody.cursor = cursor;

          console.log(`[knot] sync attempt ${attempt}/${maxAttempts}`);

          const syncResp = await fetch(url, {
            method: "POST",
            headers: {
              Authorization: authHeader,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(syncBody),
          });

          const syncText = await syncResp.text();
          console.log(`[knot] sync status: ${syncResp.status}, preview: ${syncText.slice(0, 200)}`);

          if (!syncResp.ok) {
            return new Response(syncText, {
              status: syncResp.status,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          const syncData = JSON.parse(syncText);

          if (syncData.transactions && syncData.transactions.length > 0) {
            console.log(`[knot] Found ${syncData.transactions.length} transactions on attempt ${attempt}`);
            return new Response(JSON.stringify(syncData), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          if (attempt < maxAttempts) {
            console.log(`[knot] No transactions yet, waiting ${delayMs}ms...`);
            await new Promise(r => setTimeout(r, delayMs));
          } else {
            // Return whatever we got on last attempt
            console.log("[knot] Max attempts reached, returning empty");
            return new Response(JSON.stringify(syncData), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        // Should not reach here
        return new Response(JSON.stringify({ transactions: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // Execute non-sync requests
    console.log(`[knot] ${action} -> ${url}`);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    console.log(`[knot] ${action} status: ${response.status}`);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw: responseText };
    }

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: data.message || `Knot API error ${response.status}`, details: data }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[knot] error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
