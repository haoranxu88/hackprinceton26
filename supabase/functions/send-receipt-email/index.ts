
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) throw new Error("RESEND_API_KEY not configured");

    const { image, userName, emailId } = await req.json();

    if (!image || !userName || !emailId) {
      return new Response(
        JSON.stringify({ error: "image, userName, and emailId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // image can be a URL or a base64 data URL (e.g. "data:image/png;base64,...")
    const imgSrc = image;

    const html = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: Arial, sans-serif; background: #f9f9f9; margin: 0; padding: 0; }
      .container { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 8px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
      h1 { color: #1a1a1a; font-size: 22px; margin-bottom: 8px; }
      p { color: #444; line-height: 1.6; }
      .receipt-img { width: 100%; max-width: 520px; border-radius: 6px; margin: 24px 0; border: 1px solid #e5e5e5; }
      .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; color: #888; font-size: 13px; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Your Receipt</h1>
      <p>Hi ${userName},</p>
      <p>
        Thank you for your purchase! Please find your generated receipt below,
        reflecting your recent SKU item transaction.
      </p>
      <img src="${imgSrc}" alt="Receipt" class="receipt-img" />
      <p>
        If you have any questions about your receipt or transaction details,
        don't hesitate to reach out to us.
      </p>
      <p>Thank you for being a valued customer — we appreciate your business!</p>
      <div class="footer">This is an automated receipt. Please do not reply to this email.</div>
    </div>
  </body>
</html>
    `.trim();

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "receipts@resend.dev",
        to: emailId,
        subject: `Your Receipt, ${userName}`,
        html,
      }),
    });

    const resBody = await res.json();

    if (!res.ok) {
      console.error("[send-receipt-email] Resend error:", resBody);
      return new Response(JSON.stringify({ error: resBody }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[send-receipt-email] Sent to", emailId, "id:", resBody.id);
    return new Response(JSON.stringify({ success: true, id: resBody.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[send-receipt-email] Unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
