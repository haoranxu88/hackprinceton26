/**
 * knot-proxy: browser-facing edge function that mediates all Knot REST calls
 * and also exposes read endpoints backed by webhook-populated tables.
 *
 * Actions:
 *   status              - credential check + environment info
 *   list-merchants      - GET /merchant/list
 *   create-session      - POST /session/create
 *   sync-transactions   - POST /transactions/sync (paged) + persist rows + cursor
 *   get-accounts        - read knot_merchant_accounts for a user
 *   get-transactions    - read knot_transactions for a user (optionally by merchant)
 */

import { corsHeaders } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/supabase.ts";
import {
  KNOT_ENVIRONMENT,
  getKnotAuth,
  knotFetch,
  mapKnotTransactionRow,
} from "../_shared/knot.ts";

type JsonBody = Record<string, unknown>;

function jsonResponse(status: number, body: JsonBody) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as JsonBody;
    const action = String(body.action || "");
    console.log("[knot-proxy] action:", action);

    const auth = getKnotAuth();

    if (action === "status") {
      return jsonResponse(200, {
        ok: auth.ok,
        hasClientId: Boolean(auth.clientId),
        clientId: auth.clientId,
        environment: KNOT_ENVIRONMENT,
      });
    }

    // --- DB-backed reads (don't require Knot creds) ---

    if (action === "get-accounts") {
      const userId = String(body.userId || body.external_user_id || "");
      if (!userId) {
        return jsonResponse(400, { error: "userId is required for get-accounts" });
      }
      const supabase = getServiceClient();
      const { data, error } = await supabase
        .from("knot_merchant_accounts")
        .select("*")
        .eq("external_user_id", userId);
      if (error) {
        return jsonResponse(500, { error: "db query failed", details: error.message });
      }
      return jsonResponse(200, { accounts: data ?? [] });
    }

    if (action === "get-transactions") {
      const userId = String(body.userId || body.external_user_id || "");
      if (!userId) {
        return jsonResponse(400, { error: "userId is required for get-transactions" });
      }
      const merchantIdRaw = body.merchantId ?? body.merchant_id;
      const merchantId =
        merchantIdRaw === undefined || merchantIdRaw === null ? null : Number(merchantIdRaw);
      const limit = Math.max(1, Math.min(1000, Number(body.limit ?? 500)));

      const supabase = getServiceClient();
      let query = supabase
        .from("knot_transactions")
        .select("*", { count: "exact" })
        .eq("external_user_id", userId)
        .order("datetime", { ascending: false })
        .limit(limit);
      if (merchantId !== null && Number.isFinite(merchantId)) {
        query = query.eq("merchant_id", merchantId);
      }
      const { data, error, count } = await query;
      if (error) {
        return jsonResponse(500, { error: "db query failed", details: error.message });
      }
      return jsonResponse(200, { transactions: data ?? [], count: count ?? (data?.length ?? 0) });
    }

    // --- Actions that require Knot credentials ---

    if (!auth.ok || !auth.authHeader) {
      return jsonResponse(500, {
        error: "KNOT_CLIENT_ID or KNOT_SECRET not configured on the edge function",
      });
    }

    if (action === "list-merchants") {
      const platform = String(body.platform || "web");
      const { ok, status, data } = await knotFetch<Record<string, unknown>>(
        `/merchant/list?type=transaction_link&platform=${encodeURIComponent(platform)}`,
        { method: "GET" },
        auth.authHeader
      );
      if (!ok) {
        return jsonResponse(status, { error: "Knot /merchant/list failed", details: data });
      }
      const record = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
      const merchants = Array.isArray(data)
        ? data
        : Array.isArray(record.merchants)
          ? record.merchants
          : [];
      return jsonResponse(200, { merchants, platform });
    }

    if (action === "create-session") {
      const userId = String(body.userId || body.external_user_id || `vigilant-${Date.now()}`);
      const { ok, status, data } = await knotFetch<Record<string, unknown>>(
        `/session/create`,
        {
          method: "POST",
          body: JSON.stringify({
            type: "transaction_link",
            external_user_id: userId,
          }),
        },
        auth.authHeader
      );
      if (!ok) {
        return jsonResponse(status, { error: "Knot /session/create failed", details: data });
      }
      const record = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
      return jsonResponse(200, {
        sessionId: record.session ?? null,
        clientId: auth.clientId,
        environment: KNOT_ENVIRONMENT,
        externalUserId: userId,
      });
    }

    if (action === "sync-transactions") {
      const userId = String(body.userId || body.external_user_id || "");
      const merchantId = Number(body.merchantId ?? body.merchant_id);
      const limit = Number(body.limit ?? 100);
      const resetCursor =
        body.reset_cursor === true || body.resetCursor === true || body.reset_sync === true;

      if (!userId || !Number.isFinite(merchantId)) {
        return jsonResponse(400, {
          error: "userId and merchantId are required for sync-transactions",
        });
      }

      const supabase = getServiceClient();

      if (resetCursor) {
        const { error: delErr } = await supabase
          .from("knot_sync_cursors")
          .delete()
          .eq("external_user_id", userId)
          .eq("merchant_id", merchantId);
        if (delErr) {
          console.warn("[knot-proxy] reset_cursor delete failed:", delErr.message);
        } else {
          console.log(`[knot-proxy] reset_cursor for user=${userId} merchant=${merchantId}`);
        }
      }

      // Resume from stored cursor so retries don't re-fetch the whole account.
      const { data: cursorRow } = await supabase
        .from("knot_sync_cursors")
        .select("cursor")
        .eq("external_user_id", userId)
        .eq("merchant_id", merchantId)
        .maybeSingle();
      let cursor: string | null =
        cursorRow && typeof cursorRow.cursor === "string" ? cursorRow.cursor : null;

      // Production scrapes take longer than dev's instant sample generation,
      // so give Knot more time to populate the first page after AUTHENTICATED.
      // Dev: 6 * 3s = 18s. Prod: 8 * 5s = 40s.
      const maxFirstPageAttempts = KNOT_ENVIRONMENT === "production" ? 8 : 6;
      const firstPageDelayMs = KNOT_ENVIRONMENT === "production" ? 5000 : 3000;
      let merchantMeta: unknown = null;
      const all: unknown[] = [];

      let firstPageDone = false;
      for (let attempt = 1; attempt <= maxFirstPageAttempts && !firstPageDone; attempt++) {
        const { ok, status, data } = await knotFetch<Record<string, unknown>>(
          `/transactions/sync`,
          {
            method: "POST",
            body: JSON.stringify({
              merchant_id: merchantId,
              external_user_id: userId,
              limit,
              cursor,
            }),
          },
          auth.authHeader
        );

        if (!ok) {
          return jsonResponse(status, {
            error: "Knot /transactions/sync failed",
            details: data,
          });
        }

        const record = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
        const batch = Array.isArray(record.transactions)
          ? (record.transactions as Array<Record<string, unknown>>)
          : [];
        const nextCursor =
          typeof record.next_cursor === "string" ? (record.next_cursor as string) : null;
        if (!merchantMeta) merchantMeta = record.merchant ?? null;

        console.log(
          `[knot-proxy] sync attempt ${attempt}: got ${batch.length} txns, next_cursor=${nextCursor ? "<set>" : "null"}`
        );

        if (batch.length > 0) {
          const merchantName =
            (merchantMeta && typeof merchantMeta === "object"
              ? ((merchantMeta as Record<string, unknown>).name as string | undefined)
              : undefined) ?? null;
          const rows = batch
            .map((t) => mapKnotTransactionRow(t, { externalUserId: userId, merchantId, merchantName }))
            .filter((r): r is Record<string, unknown> => r !== null);
          if (rows.length > 0) {
            const { error: upsertErr } = await supabase
              .from("knot_transactions")
              .upsert(rows, { onConflict: "id" });
            if (upsertErr) {
              console.error("[knot-proxy] transactions upsert failed:", upsertErr.message);
            }
          }
          all.push(...batch);
        }

        // Always persist the cursor so later calls resume correctly.
        await supabase
          .from("knot_sync_cursors")
          .upsert(
            {
              external_user_id: userId,
              merchant_id: merchantId,
              cursor: nextCursor,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "external_user_id,merchant_id" }
          );

        cursor = nextCursor;
        if (batch.length > 0 || !cursor || attempt === maxFirstPageAttempts) {
          firstPageDone = true;
          break;
        }
        await new Promise((r) => setTimeout(r, firstPageDelayMs));
      }

      // Paginate through the remaining pages synchronously (already got first page).
      while (cursor) {
        const { ok, status, data } = await knotFetch<Record<string, unknown>>(
          `/transactions/sync`,
          {
            method: "POST",
            body: JSON.stringify({
              merchant_id: merchantId,
              external_user_id: userId,
              limit,
              cursor,
            }),
          },
          auth.authHeader
        );
        if (!ok) {
          console.log("[knot-proxy] sync pagination failed", status, data);
          break;
        }
        const record = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
        const batch = Array.isArray(record.transactions)
          ? (record.transactions as Array<Record<string, unknown>>)
          : [];
        if (record.merchant && !merchantMeta) merchantMeta = record.merchant;

        if (batch.length > 0) {
          const merchantName =
            (merchantMeta && typeof merchantMeta === "object"
              ? ((merchantMeta as Record<string, unknown>).name as string | undefined)
              : undefined) ?? null;
          const rows = batch
            .map((t) => mapKnotTransactionRow(t, { externalUserId: userId, merchantId, merchantName }))
            .filter((r): r is Record<string, unknown> => r !== null);
          if (rows.length > 0) {
            const { error: upsertErr } = await supabase
              .from("knot_transactions")
              .upsert(rows, { onConflict: "id" });
            if (upsertErr) {
              console.error("[knot-proxy] transactions upsert failed:", upsertErr.message);
            }
          }
          all.push(...batch);
        }

        cursor =
          typeof record.next_cursor === "string" ? (record.next_cursor as string) : null;
        await supabase
          .from("knot_sync_cursors")
          .upsert(
            {
              external_user_id: userId,
              merchant_id: merchantId,
              cursor,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "external_user_id,merchant_id" }
          );
      }

      // Update account snapshot: connected + latest counts.
      const merchantName =
        (merchantMeta && typeof merchantMeta === "object"
          ? ((merchantMeta as Record<string, unknown>).name as string | undefined)
          : undefined) ?? null;
      const { count: totalCount } = await supabase
        .from("knot_transactions")
        .select("id", { count: "exact", head: true })
        .eq("external_user_id", userId)
        .eq("merchant_id", merchantId);

      await supabase
        .from("knot_merchant_accounts")
        .upsert(
          {
            external_user_id: userId,
            merchant_id: merchantId,
            merchant_name: merchantName,
            connection_status: "connected",
            last_synced_at: new Date().toISOString(),
            transaction_count: totalCount ?? 0,
          },
          { onConflict: "external_user_id,merchant_id" }
        );

      return jsonResponse(200, {
        transactions: all,
        merchant: merchantMeta,
        count: all.length,
        total: totalCount ?? all.length,
      });
    }

    return jsonResponse(400, { error: `Unknown action: ${action}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("[knot-proxy] error:", message);
    return jsonResponse(500, { error: message });
  }
});
