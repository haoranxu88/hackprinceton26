const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailItem {
  name: string;
  external_id?: string;
  quantity?: number;
  unit_price?: string | number;
  total_price?: string | number;
}

interface Payload {
  emailId: string;
  lawsuitTitle: string;
  lawsuitDefendant?: string;
  lawsuitClaimUrl?: string;
  merchant: string;
  transactionId: string;
  transactionDate: string;
  matchedItems: EmailItem[];
  allItems: EmailItem[];
  pdfBase64: string;
  pdfFileName?: string;
  userName?: string;
}

function escapeHtml(value: string | number | undefined | null): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCurrency(value: string | number | undefined): string {
  if (value === undefined || value === null || value === "") return "-";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function buildHtml(p: Payload): string {
  const matchedRows = p.matchedItems
    .map(
      (item) => `
      <li style="margin-bottom:6px;">
        <strong>${escapeHtml(item.name)}</strong>
        ${item.external_id ? `<span style="color:#888;"> - ${escapeHtml(item.external_id)}</span>` : ""}
      </li>`
    )
    .join("");

  const allRows = p.allItems
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 12px; border-bottom:1px solid #eee; font-size:13px;">${escapeHtml(item.name)}</td>
        <td style="padding:10px 12px; border-bottom:1px solid #eee; font-size:13px; color:#666; font-family: 'SFMono-Regular', Menlo, monospace;">${escapeHtml(item.external_id ?? "-")}</td>
        <td style="padding:10px 12px; border-bottom:1px solid #eee; font-size:13px; text-align:right;">${escapeHtml(formatCurrency(item.unit_price))}</td>
        <td style="padding:10px 12px; border-bottom:1px solid #eee; font-size:13px; text-align:right;">${escapeHtml(item.quantity ?? 1)}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Claim Receipt</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background:#f7f5f0; margin:0; padding:32px 16px; color:#222;">
    <div style="max-width:620px; margin:0 auto; background:#ffffff; border:1px solid #e5e3dd; border-radius:10px; overflow:hidden;">
      <div style="padding:28px 32px 20px; border-bottom:1px solid #eee;">
        <div style="font-size:11px; letter-spacing:0.15em; text-transform:uppercase; color:#888; font-weight:600;">Digital Transaction Record</div>
        <h1 style="font-size:20px; margin:8px 0 4px; font-weight:700; color:#1a1a1a;">${escapeHtml(p.lawsuitTitle)}</h1>
        ${p.lawsuitDefendant ? `<div style="color:#666; font-size:13px;">vs. ${escapeHtml(p.lawsuitDefendant)}</div>` : ""}
      </div>

      <div style="padding:24px 32px;">
        <p style="margin:0 0 16px; font-size:14px; line-height:1.55; color:#333;">
          ${p.userName ? `Hi ${escapeHtml(p.userName)},` : "Hello,"}
        </p>
        <p style="margin:0 0 20px; font-size:14px; line-height:1.55; color:#333;">
          Attached is your verified transaction record to be used as proof of purchase for the settlement above.
          A summary of the Knot-verified transaction is below.
        </p>

        <div style="background:#faf5e8; border:1px solid #e8dcb6; border-radius:8px; padding:16px 18px; margin-bottom:24px;">
          <div style="font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:#8c6a1f; font-weight:700; margin-bottom:8px;">Eligible Items (Lawsuit Registry)</div>
          <ul style="margin:0; padding-left:18px; font-size:13px; color:#333;">
            ${matchedRows}
          </ul>
        </div>

        <div style="display:flex; flex-wrap:wrap; gap:12px 32px; margin-bottom:20px; font-size:13px;">
          <div><div style="color:#888; font-size:11px; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:2px;">Merchant</div><div style="color:#222; font-weight:600;">${escapeHtml(p.merchant)}</div></div>
          <div><div style="color:#888; font-size:11px; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:2px;">Date</div><div style="color:#222; font-weight:600;">${escapeHtml(formatDate(p.transactionDate))}</div></div>
          <div><div style="color:#888; font-size:11px; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:2px;">Transaction ID</div><div style="color:#222; font-weight:600; font-family: 'SFMono-Regular', Menlo, monospace; font-size:12px;">${escapeHtml(p.transactionId)}</div></div>
        </div>

        <table style="width:100%; border-collapse:collapse; border:1px solid #e5e5e5; border-radius:8px; overflow:hidden;">
          <thead>
            <tr style="background:#1c1c20; color:#fff;">
              <th style="padding:10px 12px; text-align:left; font-size:12px; letter-spacing:0.04em;">Item Name</th>
              <th style="padding:10px 12px; text-align:left; font-size:12px; letter-spacing:0.04em;">External ID</th>
              <th style="padding:10px 12px; text-align:right; font-size:12px; letter-spacing:0.04em;">Unit Price</th>
              <th style="padding:10px 12px; text-align:right; font-size:12px; letter-spacing:0.04em;">Qty</th>
            </tr>
          </thead>
          <tbody>
            ${allRows}
          </tbody>
        </table>

        ${
          p.lawsuitClaimUrl
            ? `<p style="margin:24px 0 0; font-size:13px; color:#555;">
                Submit this record on the official settlement site:
                <a href="${escapeHtml(p.lawsuitClaimUrl)}" style="color:#1a56db; text-decoration:underline;">${escapeHtml(p.lawsuitClaimUrl)}</a>
              </p>`
            : ""
        }
      </div>

      <div style="padding:16px 32px; border-top:1px solid #eee; background:#fafafa; font-size:12px; color:#888; text-align:center;">
        Verified via Knot API - Secure Transaction Record
      </div>
    </div>
    <div style="text-align:center; color:#aaa; font-size:11px; margin-top:16px;">
      This is an automated claim receipt. Do not reply to this email.
    </div>
  </body>
</html>`;
}

/**
 * Resend sender policy:
 *   - `onboarding@resend.dev` is the ONLY sender on the resend.dev sandbox
 *     domain that works out of the box; every other `*@resend.dev` address
 *     returns 403 "You can only send testing emails ...".
 *   - Set the RESEND_FROM secret to override (e.g. "Vigilant <noreply@yourdomain.com>")
 *     once a domain is verified in the Resend dashboard.
 */
const DEFAULT_FROM = "Vigilant Claim Receipts <onboarding@resend.dev>";

function describeResendError(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.error === "string") return obj.error;
    if (obj.error && typeof obj.error === "object") {
      const inner = obj.error as Record<string, unknown>;
      if (typeof inner.message === "string") return inner.message;
    }
  }
  return fallback;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({
          error:
            "RESEND_API_KEY is not configured on the send-receipt-email edge function. " +
            "Add it with: supabase secrets set RESEND_API_KEY=re_xxx",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = (await req.json()) as Partial<Payload>;

    const required: (keyof Payload)[] = [
      "emailId",
      "lawsuitTitle",
      "merchant",
      "transactionId",
      "transactionDate",
      "matchedItems",
      "allItems",
      "pdfBase64",
    ];
    const missing = required.filter((k) => !payload[k]);
    if (missing.length > 0) {
      return new Response(
        JSON.stringify({ error: `Missing required fields: ${missing.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const full = payload as Payload;
    const html = buildHtml(full);
    const fileName = full.pdfFileName ?? `claim-receipt-${full.transactionId}.pdf`;
    const from = Deno.env.get("RESEND_FROM") || DEFAULT_FROM;

    const resendBody = {
      from,
      to: full.emailId,
      subject: `Claim Receipt: ${full.lawsuitTitle}`,
      html,
      attachments: [
        {
          filename: fileName,
          content: full.pdfBase64,
        },
      ],
    };

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(resendBody),
    });

    const resBody = await res.json().catch(() => ({}));

    if (!res.ok) {
      const message = describeResendError(resBody, `Resend HTTP ${res.status}`);
      console.error("[send-receipt-email] Resend error:", res.status, resBody);

      let hint = "";
      if (res.status === 403) {
        // Most common 403 from Resend on a default sandbox account:
        // "You can only send testing emails to your own email address."
        hint =
          " Hint: Resend sandbox only delivers to the email address that owns the Resend account. " +
          "Either send to your own account email, or verify a custom domain in the Resend dashboard " +
          "and set RESEND_FROM to an address on that domain.";
      } else if (res.status === 401) {
        hint = " Hint: RESEND_API_KEY is invalid or revoked — rotate it in the Resend dashboard.";
      } else if (res.status === 422) {
        hint = " Hint: Resend rejected the request payload (likely the from address or attachment).";
      }

      return new Response(
        JSON.stringify({
          error: message + hint,
          resendStatus: res.status,
          resendBody: resBody,
          sentFrom: from,
          sentTo: full.emailId,
        }),
        {
          // Propagate Resend's status back to the client unchanged so the UI
          // can distinguish "config problem" (4xx) from "outage" (5xx).
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("[send-receipt-email] Sent to", full.emailId, "id:", resBody.id, "from:", from);
    return new Response(JSON.stringify({ success: true, id: resBody.id, from }), {
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
