/**
 * Shared Knot REST helpers used by both knot-proxy and knot-webhook.
 * Keeps one source of truth for base URL, auth, and fetch plumbing.
 */

export const KNOT_ENVIRONMENT: "production" | "development" =
  (Deno.env.get("KNOT_ENVIRONMENT") || "development").toLowerCase() === "production"
    ? "production"
    : "development";

export const KNOT_BASE_URL =
  KNOT_ENVIRONMENT === "production"
    ? "https://production.knotapi.com"
    : "https://development.knotapi.com";

export interface KnotAuth {
  ok: boolean;
  clientId: string | null;
  authHeader: string | null;
  secret: string | null;
}

export function getKnotAuth(): KnotAuth {
  const clientId = Deno.env.get("KNOT_CLIENT_ID") ?? null;
  const secret = Deno.env.get("KNOT_SECRET") ?? null;
  if (!clientId || !secret) {
    return { ok: false, clientId, authHeader: null, secret };
  }
  return {
    ok: true,
    clientId,
    authHeader: `Basic ${btoa(`${clientId}:${secret}`)}`,
    secret,
  };
}

export interface KnotFetchResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

/**
 * Perform an authenticated request against Knot's REST API.
 * Returns parsed JSON on success; `{ raw: text }` if the body wasn't JSON.
 */
export async function knotFetch<T = unknown>(
  path: string,
  init: RequestInit,
  authHeader: string
): Promise<KnotFetchResult<T>> {
  const resp = await fetch(`${KNOT_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await resp.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { ok: resp.ok, status: resp.status, data: data as T };
}

// ---------- Transaction normalisation ----------

/**
 * Map a raw Knot transaction object into a row shape ready for upsert into
 * public.knot_transactions. Preserves the original payload in `raw` so no
 * data is lost even if the schema evolves.
 */
export function mapKnotTransactionRow(
  txn: Record<string, unknown>,
  context: {
    externalUserId: string;
    merchantId: number;
    merchantName?: string | null;
  }
): Record<string, unknown> | null {
  if (!txn || typeof txn !== "object") return null;
  const id = typeof txn.id === "string" ? txn.id : null;
  if (!id) return null;

  const price = (txn.price && typeof txn.price === "object"
    ? txn.price
    : {}) as Record<string, unknown>;
  const datetime = typeof txn.datetime === "string" ? txn.datetime : null;
  if (!datetime) return null;
  const orderStatus = typeof txn.order_status === "string" ? txn.order_status : "UNRECOGNIZED";
  const total = typeof price.total === "string" ? price.total : "0";

  return {
    id,
    external_user_id: context.externalUserId,
    merchant_id: context.merchantId,
    merchant_name: context.merchantName ?? null,
    external_id: typeof txn.external_id === "string" ? txn.external_id : null,
    datetime,
    order_status: orderStatus,
    url: typeof txn.url === "string" ? txn.url : null,
    price_total: total,
    price_sub_total: typeof price.sub_total === "string" ? price.sub_total : null,
    price_currency: typeof price.currency === "string" ? price.currency : null,
    products: Array.isArray(txn.products) ? txn.products : null,
    payment_methods: Array.isArray(txn.payment_methods) ? txn.payment_methods : null,
    shipping: txn.shipping && typeof txn.shipping === "object" ? txn.shipping : null,
    raw: txn,
    updated_at: new Date().toISOString(),
  };
}
