---
name: knot-sync-transactions
description: >
  Sync and store SKU-level transaction data from Knot's API when card switching is already
  implemented or another use case that links merchant accounts is in place. Use when: (1) "sync
  transaction data", (2) "fetch transactions from Knot", (3) "retrieve SKU-level data",
  (4) "store transactions from the sync endpoint", (5) "pull transactions from Knot",
  (6) implementing cursor-based transaction pagination. This skill assumes merchant accounts
  are already linked and webhooks are already being received. If the user needs to implement
  merchant account linking from scratch, use knot-transaction-link instead.
metadata:
  author: Knot
  version: "1.0"
---

# Sync Transactions

Sync and store SKU-level transaction data from Knot's API. This skill assumes merchant accounts are already linked to Knot (e.g. via CardSwitcher) and the `NEW_TRANSACTIONS_AVAILABLE` webhook is already being received.

## Before Starting: Load API Context

### Option A: Knot MCP (preferred)

If the `knot-docs` MCP server is available, use `ToolSearch` with query `+knot-docs` to load the tools, then fetch these pages:

1. `mcp__knot-docs__get_page_docs` with page `api-reference/products/transaction-link/sync` — Sync Transactions endpoint (request/response, params, status codes)
2. `mcp__knot-docs__get_page_docs` with page `transaction-link/webhook-events/new-transactions-available` — NEW_TRANSACTIONS_AVAILABLE webhook payload
3. `mcp__knot-docs__get_page_docs` with page `transaction-link/webhook-events/updated-transactions-available` — UPDATED_TRANSACTIONS_AVAILABLE webhook payload
4. `mcp__knot-docs__get_page_docs` with page `webhooks` — webhook verification and retry behavior

If the `knot-docs` MCP is not installed, ask the user to run the following command in their terminal:

```bash
npx add-mcp https://docs.knotapi.com/mcp --name knot-docs
```

### Option B: No MCP available

If the MCP server cannot be installed or used, skip the MCP calls. The workflow below contains everything needed to build the integration.

## Workflow

### Step 1: API Authentication

All Knot API requests use Basic Auth: `Authorization: Basic base64(client_id:secret)`.

Check the user's codebase for existing Knot credentials (environment variables, config files, `.env`). If credentials are already available, use them. If not, ask the user to provide their `client_id` and `secret` so you can base64-encode them and proceed. Point them to the Knot Dashboard at https://dashboard.knotapi.com/developers/keys where each environment (development and production) has its own credentials.

### Step 2: Webhook Endpoint

Ask the user: **Do you have an existing webhook URL configured in the Knot Dashboard at https://dashboard.knotapi.com/webhooks?** If they have already integrated other Knot products (e.g. CardSwitcher, SubscriptionManager), they likely already have a webhook configured. If no webhook exists, build a new POST endpoint and provide the URL to the user so they can configure it in the Knot Dashboard at https://dashboard.knotapi.com/webhooks for the appropriate environment.

The webhook endpoint must handle two events:

**`NEW_TRANSACTIONS_AVAILABLE`** — new transactions are ready to sync:
```json
{
  "event": "NEW_TRANSACTIONS_AVAILABLE",
  "external_user_id": "user-123",
  "merchant": { "id": 19, "name": "DoorDash" },
  "timestamp": 1710864923198
}
```

**`UPDATED_TRANSACTIONS_AVAILABLE`** — existing transactions have changed (e.g. `order_status` updated from `SHIPPED` to `DELIVERED`, or `price.total` changed):
```json
{
  "event": "UPDATED_TRANSACTIONS_AVAILABLE",
  "external_user_id": "user-123",
  "merchant": { "id": 19, "name": "DoorDash" },
  "updated": [
    { "id": "txn-id-1" },
    { "id": "txn-id-2" }
  ],
  "timestamp": 1710864923198
}
```

Route by `event` field:
- `NEW_TRANSACTIONS_AVAILABLE` -> enqueue sync job for `(external_user_id, merchant.id)`
- `UPDATED_TRANSACTIONS_AVAILABLE` -> enqueue update job for each `updated[].id`

Return 200 immediately. Knot times out after 10 seconds and retries up to 2 times on non-200 responses.

### Step 3: Sync Transactions with Cursor Pagination

When the `NEW_TRANSACTIONS_AVAILABLE` webhook is received, call `POST /transactions/sync` in a loop using the `external_user_id` and `merchant.id` from the webhook payload. Pass the cursor from the previous response to get the next page. Continue until `next_cursor` is `null`.

```
cursor = load_stored_cursor(external_user_id, merchant_id)  // null on first sync

loop:
  response = POST /transactions/sync {
    merchant_id,
    external_user_id,
    cursor,
    limit: 100
  }

  store_transactions(response.transactions)
  cursor = response.next_cursor
  // Important: persist cursor after each page to avoid re-scanning already-fetched transactions
  persist_cursor(external_user_id, merchant_id, cursor)

  break if cursor is null
```

**Cursor behavior:**
- `cursor` is an opaque string returned by the API that tells it where to resume
- On the first-ever sync, send `cursor: null` to start from the beginning
- On subsequent syncs (triggered by future `NEW_TRANSACTIONS_AVAILABLE` webhooks), send the last stored cursor to retrieve only new transactions since the previous sync
- `limit` range: 1-100 (default 100 — use the max to minimize API calls)
- When `next_cursor` is `null` in the response, all available transactions have been returned

**Persist the cursor:** Store the cursor keyed by `(external_user_id, merchant_id)` after each page. This ensures:
- If the sync job crashes mid-pagination, it resumes from the last completed page rather than re-fetching everything
- On the next `NEW_TRANSACTIONS_AVAILABLE` webhook, the sync starts where it left off and only retrieves new transactions

### Step 4: Handle Transaction Updates

When `UPDATED_TRANSACTIONS_AVAILABLE` is received, call `GET /transactions/{id}` for each transaction ID in the `updated` array. The response is a single transaction object. Upsert the updated transaction into storage keyed on its `id`, overwriting the previous version.

```
for each updated[].id:
  txn = GET /transactions/{id}
  upsert txn into storage (keyed on txn.id)
```

### Step 5: Store Transactions

Store **all fields** from each transaction object. See the Transaction Object Schema below for the full schema with every field, its type, and whether it can be `null`. The implementation must handle nullable fields — do not assume any optional field will be present.

**Deduplication:** Knot assigns each transaction a unique `id`. Use this as the dedup key via upsert.

**Why duplicates can occur:**
- Webhook retries: Knot retries on non-200 responses, so the same webhook can arrive multiple times, triggering concurrent sync jobs
- Crash recovery: If a sync job crashes after storing transactions but before persisting the cursor, the re-run will re-fetch the same page
- Overlapping cursor windows: In rare cases, transactions near the cursor boundary may appear in consecutive pages

**How to deduplicate:**
- Use `INSERT ... ON CONFLICT (id) DO UPDATE` (PostgreSQL) or equivalent upsert, keyed on the transaction `id`
- This ensures storing the same transaction twice simply overwrites with the latest data rather than creating a duplicate row
- If using a NoSQL store, use the transaction `id` as the document key / partition key

**Schema recommendation:**
```sql
-- Adapt types/syntax to your database (e.g. JSON column type, timestamp handling)
CREATE TABLE knot_transactions (
  id TEXT PRIMARY KEY,                    -- Knot's transaction ID, dedup key
  user_id TEXT NOT NULL REFERENCES users(id),  -- FK to your users table
  merchant_id INTEGER NOT NULL,
  external_id TEXT,                       -- Merchant-provided order identifier (nullable)
  datetime TIMESTAMP NOT NULL,
  order_status TEXT NOT NULL,
  url TEXT,
  price_total TEXT NOT NULL,
  price_sub_total TEXT,
  price_currency TEXT,
  products JSON,                          -- Array of product objects; use JSON/JSONB or normalize
  payment_methods JSON,                   -- Array of payment method objects
  shipping JSON,                          -- Shipping object (nullable)
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_knot_txn_user_merchant
  ON knot_transactions (user_id, merchant_id);

CREATE TABLE knot_sync_cursors (
  user_id TEXT NOT NULL REFERENCES users(id),
  merchant_id INTEGER NOT NULL,
  cursor TEXT,                            -- Last cursor from /transactions/sync
  updated_at TIMESTAMP DEFAULT now()
);
```

The upsert (used for both new syncs and updates):
```sql
INSERT INTO knot_transactions (id, user_id, merchant_id, external_id, datetime, order_status, url, price_total, price_sub_total, price_currency, products, payment_methods, shipping, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
ON CONFLICT (id) DO UPDATE SET
  order_status = EXCLUDED.order_status,
  price_total = EXCLUDED.price_total,
  price_sub_total = EXCLUDED.price_sub_total,
  products = EXCLUDED.products,
  payment_methods = EXCLUDED.payment_methods,
  shipping = EXCLUDED.shipping,
  updated_at = now();
```

### Step 6: Testing

In the development environment, use `POST /development/accounts/link` (base URL: `https://development.knotapi.com`) to link a merchant account and generate sample transactions without the client-side SDK. This triggers the same webhook flow as a real user.

**Generate new transactions:**
```
POST https://development.knotapi.com/development/accounts/link
{
  "external_user_id": "test-user-1",
  "merchant_id": 19,
  "transactions": {
    "new": true,
    "updated": false
  }
}
```

This will:
1. Link the merchant account and emit an `AUTHENTICATED` webhook
2. Generate 205 sample transactions within a few seconds
3. Emit a `NEW_TRANSACTIONS_AVAILABLE` webhook, triggering the sync flow

**Generate new + updated transactions:**
```
POST https://development.knotapi.com/development/accounts/link
{
  "external_user_id": "test-user-1",
  "merchant_id": 19,
  "transactions": {
    "new": true,
    "updated": true
  }
}
```

Same as above, but also updates a few of the newly-generated transactions and emits an `UPDATED_TRANSACTIONS_AVAILABLE` webhook with their IDs shortly after. `new: true` is required to use `updated: true`.

**Tips:**
- Use `merchant_id: 19` (DoorDash) for testing
- If testing multiple times consecutively, use a different `external_user_id` each time
- Ensure a webhook URL is configured in the Knot Dashboard at https://dashboard.knotapi.com/developers/webhooks for the development environment before calling this endpoint
- Auth: same Basic Auth as all other API calls, using your development environment credentials

## Pitfalls

- **Webhook timeout**: Return 200 immediately. Process the sync asynchronously.
- **Always loop**: Do not assume a single-page response. Loop until `next_cursor` is `null`.
- **Always upsert**: Never `INSERT` without `ON CONFLICT`. Duplicates will occur.
- **Persist cursor per-page**: Do not wait until the full sync completes. Persist after each page so crash recovery works.
- **Handle nulls**: Many transaction fields are nullable. Check the schema below for which fields can be `null` and handle accordingly.

## Transaction Object Schema

Store all fields from each transaction. Fields marked nullable may be `null` — the implementation must handle this.

### Top-level fields

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | string (UUID) | No | Unique transaction identifier. **Dedup key.** |
| `external_id` | string | Yes | Merchant-provided order identifier |
| `datetime` | string (ISO 8601) | No | Transaction timestamp in UTC |
| `order_status` | enum | No | Current order lifecycle state |
| `url` | string | Yes | Direct link to order in merchant account |
| `price` | object | No | Price breakdown (see below) |
| `products` | array | No | SKU-level items (see below) |
| `payment_methods` | array | No | Payment methods used (see below) |
| `shipping` | object | Yes | Delivery details (see below). Null for digital/in-store orders. |

**Note:** The `merchant` object (`{ id, name }`) is returned in the `/transactions/sync` response wrapper, not inside each transaction object.

**order_status enum:** `ORDERED`, `BILLED`, `SHIPPED`, `DELIVERED`, `PICKED_UP`, `COMPLETED`, `REFUNDED`, `CANCELLED`, `FAILED`, `RETURNED`, `UNRECOGNIZED`

### price object

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `sub_total` | string | Yes | Sum of item prices before adjustments |
| `total` | string | No | Final amount after all adjustments |
| `currency` | string | Yes | ISO 4217 currency code (e.g. "USD") |
| `adjustments` | array | No | Modifications to subtotal (tax, fees, discounts) |

**adjustments[].type enum:** `DISCOUNT`, `TAX`, `TIP`, `FEE`, `REFUND`, `UNRECOGNIZED`

Each adjustment has: `type` (enum, not null), `label` (string, nullable), `amount` (string, not null — positive increases total, negative decreases).

### products[]

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `external_id` | string | Yes | Merchant-provided product identifier |
| `name` | string | No | Product name |
| `description` | string | Yes | Additional product details |
| `url` | string | Yes | Link to product page on merchant site |
| `image_url` | string | Yes | Link to product image |
| `quantity` | integer | Yes | Number of units |
| `eligibility` | array of strings | No | Special spending categories (e.g. "FSA/HSA") |
| `price` | object | Yes | `{ sub_total, total, unit_price }` — all nullable strings |
| `seller` | object | Yes | `{ name, url }` — both nullable strings |

### payment_methods[]

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `type` | enum | No | Payment method category |
| `brand` | string | Yes | Card network or store card name |
| `last_four` | string | Yes | Last four digits of card number |
| `transaction_amount` | string | Yes | Amount charged to this payment method |
| `name` | string | Yes | Customer-provided label (e.g. "Work Card") |
| `external_id` | string | Yes | Merchant-provided payment method identifier |

**type enum:** `CARD`, `APPLE_PAY`, `GOOGLE_PAY`, `AMAZON_PAY`, `PAYPAL`, `CASH_APP`, `VENMO`, `AFFIRM`, `KLARNA`, `GIFT_CARD`, `CASH`, `BANK_ACCOUNT`, `LOYALTY_POINTS`, `UNRECOGNIZED`

### shipping object

Nullable at the top level. When present: `location` (nullable object) -> `address` (nullable object with `line1`, `line2`, `city`, `region`, `postal_code` all nullable strings, `country` not null), `first_name` (nullable), `last_name` (nullable).
