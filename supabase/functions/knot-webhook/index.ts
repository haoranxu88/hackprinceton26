/**
 * Knot webhook receiver.
 *
 * Responsibilities:
 * 1. Read the raw body once (needed for HMAC + JSON parse).
 * 2. Verify HMAC-SHA256 signature against Knot-Signature header.
 * 3. Return 200 immediately and dispatch handlers via EdgeRuntime.waitUntil
 *    so we never exceed Knot's 10s timeout.
 * 4. Dispatch by `event`:
 *    - AUTHENTICATED                -> upsert knot_merchant_accounts (connected)
 *    - NEW_TRANSACTIONS_AVAILABLE   -> loop POST /transactions/sync, upsert transactions, persist cursor
 *    - UPDATED_TRANSACTIONS_AVAILABLE -> GET /transactions/{id} per id, upsert
 *    - ACCOUNT_LOGIN_REQUIRED       -> mark disconnected
 *    - MERCHANT_STATUS_UPDATE       -> log only (no dedicated table yet)
 *
 * Deploy with --no-verify-jwt (Knot signs with its own HMAC, not a Supabase JWT).
 */

import { corsHeaders } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/supabase.ts";
import {
  getKnotAuth,
  knotFetch,
  mapKnotTransactionRow,
} from "../_shared/knot.ts";

// EdgeRuntime is provided by the Supabase Edge Functions runtime (Deno Deploy).
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------- Signature verification ----------

const SIGNATURE_KEYS = [
  "Content-Length",
  "Content-Type",
  "Encryption-Type",
  "event",
  "session_id",
] as const;

/**
 * Build the canonical signing string per Knot webhook docs:
 *   key1|value1|key2|value2|...
 * Omit pairs whose value is absent (e.g. session_id on MERCHANT_STATUS_UPDATE).
 */
function buildSigningString(
  headers: Headers,
  payload: Record<string, unknown>
): { signingString: string; components: Array<[string, string]> } {
  const lookup: Record<string, string | undefined> = {
    "Content-Length": headers.get("content-length") ?? undefined,
    "Content-Type": headers.get("content-type") ?? undefined,
    "Encryption-Type": headers.get("encryption-type") ?? undefined,
    event: typeof payload.event === "string" ? payload.event : undefined,
    session_id:
      typeof payload.session_id === "string" ? (payload.session_id as string) : undefined,
  };

  const parts: string[] = [];
  const components: Array<[string, string]> = [];
  for (const key of SIGNATURE_KEYS) {
    const value = lookup[key];
    if (value === undefined || value === null || value === "") continue;
    parts.push(key, value);
    components.push([key, value]);
  }
  return { signingString: parts.join("|"), components };
}

async function hmacSha256Base64(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  let binary = "";
  const bytes = new Uint8Array(sig);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------- Event handlers ----------

interface WebhookPayload {
  event: string;
  external_user_id?: string;
  merchant?: { id?: number; name?: string };
  session_id?: string;
  updated?: Array<{ id: string }>;
  [k: string]: unknown;
}

async function handleAuthenticated(payload: WebhookPayload): Promise<void> {
  const supabase = getServiceClient();
  const externalUserId = payload.external_user_id;
  const merchantId = payload.merchant?.id;
  if (!externalUserId || typeof merchantId !== "number") {
    console.warn("[knot-webhook] AUTHENTICATED missing external_user_id or merchant.id", payload);
    return;
  }
  const merchantName = payload.merchant?.name ?? null;
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("knot_merchant_accounts")
    .upsert(
      {
        external_user_id: externalUserId,
        merchant_id: merchantId,
        merchant_name: merchantName,
        connection_status: "connected",
        last_authenticated_at: nowIso,
      },
      { onConflict: "external_user_id,merchant_id" }
    );
  if (error) {
    console.error("[knot-webhook] failed to upsert merchant account:", error.message);
    return;
  }
  console.log(
    `[knot-webhook] AUTHENTICATED stored: user=${externalUserId} merchant=${merchantId} (${merchantName ?? "?"})`
  );
}

async function handleAccountLoginRequired(payload: WebhookPayload): Promise<void> {
  const supabase = getServiceClient();
  const externalUserId = payload.external_user_id;
  const merchantId = payload.merchant?.id;
  if (!externalUserId || typeof merchantId !== "number") return;
  const { error } = await supabase
    .from("knot_merchant_accounts")
    .upsert(
      {
        external_user_id: externalUserId,
        merchant_id: merchantId,
        merchant_name: payload.merchant?.name ?? null,
        connection_status: "disconnected",
      },
      { onConflict: "external_user_id,merchant_id" }
    );
  if (error) {
    console.error("[knot-webhook] failed to mark disconnected:", error.message);
  } else {
    console.log(
      `[knot-webhook] ACCOUNT_LOGIN_REQUIRED: user=${externalUserId} merchant=${merchantId}`
    );
  }
}

/**
 * Loop POST /transactions/sync until next_cursor is null, upserting each page
 * and persisting the cursor after every page. Updates last_synced_at and
 * transaction_count on the account row when done.
 */
async function handleNewTransactions(payload: WebhookPayload): Promise<void> {
  const supabase = getServiceClient();
  const externalUserId = payload.external_user_id;
  const merchantId = payload.merchant?.id;
  const merchantName = payload.merchant?.name ?? null;
  if (!externalUserId || typeof merchantId !== "number") {
    console.warn("[knot-webhook] NEW_TRANSACTIONS missing ids", payload);
    return;
  }

  const auth = getKnotAuth();
  if (!auth.ok || !auth.authHeader) {
    console.error("[knot-webhook] missing KNOT_CLIENT_ID/KNOT_SECRET; cannot sync");
    return;
  }

  // Load stored cursor (resume partial sync, or start from null).
  const { data: cursorRow } = await supabase
    .from("knot_sync_cursors")
    .select("cursor")
    .eq("external_user_id", externalUserId)
    .eq("merchant_id", merchantId)
    .maybeSingle();

  let cursor: string | null =
    cursorRow && typeof cursorRow.cursor === "string" ? cursorRow.cursor : null;
  let totalUpserted = 0;
  let pages = 0;

  while (true) {
    pages++;
    const { ok, status, data } = await knotFetch<Record<string, unknown>>(
      "/transactions/sync",
      {
        method: "POST",
        body: JSON.stringify({
          merchant_id: merchantId,
          external_user_id: externalUserId,
          limit: 50,
          cursor,
        }),
      },
      auth.authHeader
    );

    if (!ok) {
      console.error(
        `[knot-webhook] /transactions/sync failed status=${status}:`,
        JSON.stringify(data).slice(0, 500)
      );
      return;
    }

    const record = (data ?? {}) as Record<string, unknown>;
    const transactions = Array.isArray(record.transactions)
      ? (record.transactions as Array<Record<string, unknown>>)
      : [];
    const nextCursor =
      typeof record.next_cursor === "string" ? (record.next_cursor as string) : null;

    if (transactions.length > 0) {
      const rows = transactions
        .map((t) => mapKnotTransactionRow(t, { externalUserId, merchantId, merchantName }))
        .filter((r): r is Record<string, unknown> => r !== null);
      if (rows.length > 0) {
        const { error: upsertErr } = await supabase
          .from("knot_transactions")
          .upsert(rows, { onConflict: "id" });
        if (upsertErr) {
          console.error("[knot-webhook] transactions upsert failed:", upsertErr.message);
          return;
        }
        totalUpserted += rows.length;
      }
    }

    // Persist cursor after every page so crash recovery works.
    const { error: cursorErr } = await supabase
      .from("knot_sync_cursors")
      .upsert(
        {
          external_user_id: externalUserId,
          merchant_id: merchantId,
          cursor: nextCursor,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "external_user_id,merchant_id" }
      );
    if (cursorErr) {
      console.error("[knot-webhook] cursor persist failed:", cursorErr.message);
    }

    cursor = nextCursor;
    console.log(
      `[knot-webhook] sync page ${pages}: +${transactions.length} txns, next_cursor=${cursor ? "<set>" : "null"}`
    );
    if (!cursor) break;
    if (pages > 200) {
      console.warn("[knot-webhook] sync aborted after 200 pages as safety cap");
      break;
    }
  }

  // Update account row: last_synced_at and transaction_count.
  const { count } = await supabase
    .from("knot_transactions")
    .select("id", { count: "exact", head: true })
    .eq("external_user_id", externalUserId)
    .eq("merchant_id", merchantId);

  await supabase
    .from("knot_merchant_accounts")
    .upsert(
      {
        external_user_id: externalUserId,
        merchant_id: merchantId,
        merchant_name: merchantName,
        connection_status: "connected",
        last_synced_at: new Date().toISOString(),
        transaction_count: count ?? 0,
      },
      { onConflict: "external_user_id,merchant_id" }
    );

  console.log(
    `[knot-webhook] NEW_TRANSACTIONS done: user=${externalUserId} merchant=${merchantId} +${totalUpserted} rows, total=${count ?? "?"}`
  );
}

async function handleUpdatedTransactions(payload: WebhookPayload): Promise<void> {
  const supabase = getServiceClient();
  const externalUserId = payload.external_user_id;
  const merchantId = payload.merchant?.id;
  const merchantName = payload.merchant?.name ?? null;
  const updated = Array.isArray(payload.updated) ? payload.updated : [];
  if (!externalUserId || typeof merchantId !== "number" || updated.length === 0) return;

  const auth = getKnotAuth();
  if (!auth.ok || !auth.authHeader) {
    console.error("[knot-webhook] missing Knot auth; cannot fetch updated transactions");
    return;
  }

  const rows: Array<Record<string, unknown>> = [];
  for (const entry of updated) {
    const id = typeof entry?.id === "string" ? entry.id : null;
    if (!id) continue;
    const { ok, status, data } = await knotFetch<Record<string, unknown>>(
      `/transactions/${encodeURIComponent(id)}`,
      { method: "GET" },
      auth.authHeader
    );
    if (!ok) {
      console.warn(`[knot-webhook] GET /transactions/${id} status=${status}`);
      continue;
    }
    const record = (data ?? {}) as Record<string, unknown>;
    // Some APIs return { transaction: {...} }; others the bare object.
    const txn = (record.transaction && typeof record.transaction === "object"
      ? record.transaction
      : record) as Record<string, unknown>;
    const row = mapKnotTransactionRow(txn, { externalUserId, merchantId, merchantName });
    if (row) rows.push(row);
  }
  if (rows.length === 0) return;
  const { error } = await supabase.from("knot_transactions").upsert(rows, { onConflict: "id" });
  if (error) {
    console.error("[knot-webhook] updated-txn upsert failed:", error.message);
  } else {
    console.log(`[knot-webhook] UPDATED_TRANSACTIONS upserted ${rows.length} rows`);
  }
}

async function dispatch(payload: WebhookPayload): Promise<void> {
  try {
    switch (payload.event) {
      case "AUTHENTICATED":
        await handleAuthenticated(payload);
        return;
      case "NEW_TRANSACTIONS_AVAILABLE":
        await handleAuthenticated(payload); // ensure account row exists/connected
        await handleNewTransactions(payload);
        return;
      case "UPDATED_TRANSACTIONS_AVAILABLE":
        await handleUpdatedTransactions(payload);
        return;
      case "ACCOUNT_LOGIN_REQUIRED":
        await handleAccountLoginRequired(payload);
        return;
      case "MERCHANT_STATUS_UPDATE":
        console.log("[knot-webhook] MERCHANT_STATUS_UPDATE:", JSON.stringify(payload));
        return;
      default:
        console.log(`[knot-webhook] unhandled event "${payload.event}"`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[knot-webhook] dispatch error for ${payload.event}:`, msg);
  }
}

// ---------- Request entry ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const rawBody = await req.text();
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody || "{}") as WebhookPayload;
  } catch (err) {
    console.error("[knot-webhook] invalid JSON:", err);
    return json(400, { error: "invalid json" });
  }

  const providedSig = req.headers.get("knot-signature") ?? req.headers.get("Knot-Signature");
  const auth = getKnotAuth();

  const acceptUnsigned =
    (Deno.env.get("KNOT_WEBHOOK_DEV_ACCEPT_UNSIGNED") || "").toLowerCase() === "true";

  if (!auth.ok || !auth.secret || !auth.clientId) {
    console.error("[knot-webhook] KNOT_CLIENT_ID/KNOT_SECRET not configured");
    return json(500, { error: "server misconfigured" });
  }

  const { signingString, components } = buildSigningString(req.headers, payload);

  // Per Knot engineering: the HMAC key is the API key, which is
  // base64(client_id:secret) -- the same value that goes in the REST
  // `Authorization: Basic ...` header. We also compute variants with the
  // raw secret and with the authHeader-prefixed "Basic ..." string as
  // defensive fallbacks in case a different SDK version signs with either.
  const apiKey = btoa(`${auth.clientId}:${auth.secret}`);
  const candidateKeys = [
    { name: "base64(client_id:secret)", key: apiKey },
    { name: "raw_secret", key: auth.secret },
  ];

  const computedSigs: Record<string, string> = {};
  let matchedWith: string | null = null;
  for (const { name, key } of candidateKeys) {
    const sig = await hmacSha256Base64(key, signingString);
    computedSigs[name] = sig;
    if (
      providedSig != null &&
      (timingSafeEqual(providedSig, sig) ||
        // Some clients URL-decode the signature; try decoded form as a fallback.
        timingSafeEqual(decodeURIComponent(providedSig), sig))
    ) {
      matchedWith = name;
      break;
    }
  }

  const verified = matchedWith !== null;

  if (!verified) {
    console.warn(
      "[knot-webhook] signature mismatch",
      JSON.stringify({
        event: payload.event,
        received: providedSig,
        computed: computedSigs,
        signingComponents: components,
      })
    );
    if (!acceptUnsigned) {
      return json(401, { error: "invalid signature" });
    }
    console.warn("[knot-webhook] KNOT_WEBHOOK_DEV_ACCEPT_UNSIGNED=true; accepting anyway");
  } else {
    console.log(`[knot-webhook] signature verified using ${matchedWith}`);
  }

  console.log(
    `[knot-webhook] accepted event=${payload.event} user=${payload.external_user_id ?? "?"} merchant=${payload.merchant?.id ?? "?"}`
  );

  // Dispatch async so we always respond within Knot's 10s window.
  const task = dispatch(payload);
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(task);
  } else {
    // Local/dev fallback: still don't block the response.
    task.catch((err) => console.error("[knot-webhook] background error:", err));
  }

  return json(200, { ok: true });
});
