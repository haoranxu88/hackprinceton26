import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createServer } from "node:http";
import { URL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../.env") });

const port = Number(process.env.PORT || 8000);
const knotBaseUrl = process.env.KNOT_BASE_URL || "https://development.knotapi.com";
const knotEnvironment = process.env.KNOT_ENVIRONMENT || "development";

const DEMO_TRANSACTIONS_PATH = resolve(__dirname, "demo-transactions-fallback.json");
let DEMO_TRANSACTIONS = [];
try {
  DEMO_TRANSACTIONS = JSON.parse(readFileSync(DEMO_TRANSACTIONS_PATH, "utf8"));
} catch {
  DEMO_TRANSACTIONS = [];
}

function countLineItems(transactions) {
  return transactions.reduce(
    (n, t) => n + (Array.isArray(t.products) ? t.products.length : 0),
    0
  );
}

function json(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  response.end(JSON.stringify(body));
}

function hasKnotEnv() {
  return Boolean(process.env.KNOT_CLIENT_ID && process.env.KNOT_SECRET);
}

function getKnotAuthHeader() {
  const clientId = process.env.KNOT_CLIENT_ID;
  const secret = process.env.KNOT_SECRET;

  if (!clientId || !secret) {
    throw new Error("Missing KNOT_CLIENT_ID or KNOT_SECRET");
  }

  return `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`;
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function knotFetch(pathname, init = {}) {
  const response = await fetch(`${knotBaseUrl}${pathname}`, {
    ...init,
    headers: {
      Authorization: getKnotAuthHeader(),
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = data?.message || data?.error || `Knot API ${response.status}`;
    const error = new Error(message);
    error.statusCode = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

/** Single pass: all pages from POST /transactions/sync (no long retries — demo uses local fallback). */
async function syncKnotTransactionsOnce(merchantId, externalUserId) {
  const allTransactions = [];
  let cursor = null;
  let pageMerchant = null;

  do {
    const page = await knotFetch("/transactions/sync", {
      method: "POST",
      body: JSON.stringify({
        merchant_id: merchantId,
        external_user_id: externalUserId,
        cursor,
        limit: 100,
      }),
    });

    const batch = Array.isArray(page.transactions) ? page.transactions : [];
    allTransactions.push(...batch);
    if (page.merchant) pageMerchant = page.merchant;
    cursor = page.next_cursor ?? null;
  } while (cursor != null);

  return { transactions: allTransactions, merchant: pageMerchant, count: allTransactions.length };
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    json(response, 400, { error: "Missing request URL" });
    return;
  }

  const url = new URL(request.url, `http://localhost:${port}`);

  if (request.method === "OPTIONS") {
    json(response, 200, { ok: true });
    return;
  }

  try {
    if (request.method === "GET" && url.pathname === "/api/knot/status") {
      json(response, 200, {
        ok: hasKnotEnv(),
        environment: knotEnvironment,
        hasClientId: Boolean(process.env.KNOT_CLIENT_ID),
        hasSecret: Boolean(process.env.KNOT_SECRET),
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/knot/session") {
      if (!hasKnotEnv()) {
        json(response, 500, {
          error: "Knot credentials are not configured on the backend.",
          missing: ["KNOT_CLIENT_ID", "KNOT_SECRET"].filter((key) => !process.env[key]),
        });
        return;
      }

      const body = await readBody(request);
      const userId = body.userId || `vigilant-${Date.now()}`;

      const data = await knotFetch("/session/create", {
        method: "POST",
        body: JSON.stringify({
          type: "transaction_link",
          external_user_id: userId,
        }),
      });

      json(response, 200, {
        sessionId: data.session,
        clientId: process.env.KNOT_CLIENT_ID,
        environment: knotEnvironment,
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/knot/merchants") {
      if (!hasKnotEnv()) {
        json(response, 500, {
          error: "Knot credentials are not configured on the backend.",
          missing: ["KNOT_CLIENT_ID", "KNOT_SECRET"].filter((key) => !process.env[key]),
        });
        return;
      }

      const platform = url.searchParams.get("platform") || "web";
      const data = await knotFetch(`/merchant/list?type=transaction_link&platform=${platform}`, {
        method: "GET",
      });

      json(response, 200, { merchants: Array.isArray(data) ? data : data?.merchants || [] });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/knot/transactions") {
      if (!hasKnotEnv()) {
        json(response, 500, {
          error: "Knot credentials are not configured on the backend.",
          missing: ["KNOT_CLIENT_ID", "KNOT_SECRET"].filter((key) => !process.env[key]),
        });
        return;
      }

      const body = await readBody(request);
      const merchantId = body.merchantId ?? body.merchant_id;
      const externalUserId = body.externalUserId ?? body.external_user_id ?? body.userId;

      if (merchantId == null || externalUserId == null || externalUserId === "") {
        json(response, 400, {
          error: "merchantId and externalUserId (or userId) are required",
        });
        return;
      }

      let transactions = [];
      let merchant = null;

      try {
        const result = await syncKnotTransactionsOnce(Number(merchantId), String(externalUserId));
        transactions = result.transactions;
        merchant = result.merchant;
      } catch (err) {
        console.log("[knot-server] transactions/sync error", err?.message || err);
      }

      if (!transactions.length && DEMO_TRANSACTIONS.length > 0) {
        const productCount = countLineItems(DEMO_TRANSACTIONS);
        json(response, 200, {
          ok: true,
          count: productCount,
          fallback: true,
          merchant: { id: Number(merchantId), name: "DoorDash" },
          transactions: DEMO_TRANSACTIONS,
        });
        return;
      }

      json(response, 200, {
        ok: true,
        count: transactions.length,
        merchant,
        transactions,
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/knot/webhooks") {
      const body = await readBody(request);
      console.log("[knot webhook]", JSON.stringify(body));
      json(response, 200, {
        ok: true,
        message: "Webhook received. This is a scaffolded placeholder for future event handling.",
      });
      return;
    }

    json(response, 404, { error: "Not found" });
  } catch (error) {
    json(response, error.statusCode || 500, {
      error: error.message || "Unexpected server error",
      details: error.details || null,
    });
  }
});

server.listen(port, () => {
  console.log(`[knot-server] listening on http://localhost:${port}`);
});
