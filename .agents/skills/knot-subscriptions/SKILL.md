---
name: knot-subscriptions
description: >
  Retrieve and store subscription data from Knot's API when card switching is already
  implemented. Subscription IDs are returned in the CARD_UPDATED webhook after a successful
  card switch. Use when: (1) "get subscription data from Knot", (2) "retrieve subscriptions",
  (3) "fetch subscription details", (4) "pull subscription data",
  (5) "get billing info from Knot". This skill assumes card switching is already implemented.
metadata:
  author: Knot
  version: "1.0"
---

# Retrieve Subscriptions

Retrieve and store subscription data from Knot's API. This skill assumes card switching is already implemented, since subscription IDs are only returned in the `CARD_UPDATED` webhook after a successful card switch.

## Before Starting: Load API Context

### Option A: Knot MCP (preferred)

If the `knot-docs` MCP server is available, use `ToolSearch` with query `+knot-docs` to load the tools, then fetch these pages:

1. `mcp__knot-docs__get_page_docs` with page `subscription-manager/quickstart` — SubscriptionManager quickstart and flow
2. `mcp__knot-docs__get_page_docs` with page `api-reference/products/subscriptions/get-by-id` — Get Subscription By ID endpoint
3. `mcp__knot-docs__get_page_docs` with page `webhooks` — webhook verification and retry behavior

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

Ask the user: **Do you have an existing webhook URL configured in the Knot Dashboard at https://dashboard.knotapi.com/webhooks?** If they have already integrated other Knot products (e.g. CardSwitcher, TransactionLink), they likely already have a webhook configured. If no webhook exists, build a new POST endpoint and provide the URL to the user so they can configure it in the Knot Dashboard at https://dashboard.knotapi.com/webhooks for the appropriate environment.

If the user has already implemented CardSwitcher, they are already handling the `CARD_UPDATED` webhook event. In that case, they just need to extract the subscription IDs from `data.subscriptions` in the existing handler — no new webhook endpoint is needed.

The `CARD_UPDATED` webhook includes subscription IDs in `data.subscriptions` when a card is successfully updated at a merchant:

```json
{
  "event": "CARD_UPDATED",
  "external_user_id": "user-123",
  "merchant": { "id": 45, "name": "Hulu" },
  "session_id": "fb5aa994-ed1c-4c3e-b29a-b2a53222e584",
  "task_id": 25605,
  "timestamp": 1710864923198,
  "data": {
    "card_id": "123456789",
    "subscriptions": [
      { "id": "ka8sdf0asdfm10as0a0sdfja7ssa8" },
      { "id": "8asdh29qjss923kd0d920skd8sjd8" }
    ]
  }
}
```

When `data.subscriptions` is present and non-empty, enqueue a job to retrieve the full details for each subscription ID.

Return 200 immediately. Knot times out after 10 seconds and retries up to 2 times on non-200 responses.

### Step 3: Retrieve Subscription Details

For each subscription ID from the `CARD_UPDATED` webhook's `data.subscriptions` array, call `GET /subscriptions/{id}` to retrieve the full subscription object.

```
for each data.subscriptions[].id:
  subscription = GET /subscriptions/{id}
  upsert subscription into storage (keyed on subscription.id)
```

### Step 4: Store Subscriptions

Store **all fields** from each subscription object. See the Subscription Object Schema below for the full schema with every field, its type, and whether it can be `null`. The implementation must handle nullable fields.

Extract the `external_user_id` and `merchant.id` from the `CARD_UPDATED` webhook payload to associate each subscription with the user and merchant.

**Deduplication:** Use the subscription `id` as the dedup key via upsert.

**Schema recommendation:**
```sql
-- Adapt types/syntax to your database (e.g. JSON column type, timestamp handling)
CREATE TABLE knot_subscriptions (
  id TEXT PRIMARY KEY,                          -- Knot's subscription ID, dedup key
  user_id TEXT NOT NULL REFERENCES users(id),   -- FK to your users table
  merchant_id INTEGER NOT NULL,
  external_id TEXT NOT NULL,                    -- Merchant-provided subscription identifier
  name TEXT NOT NULL,                           -- Subscription name (e.g. "Hulu (No Ads)")
  description TEXT,                             -- Nullable
  status TEXT NOT NULL,                         -- ACTIVE, CANCELLED, PAUSED, etc.
  billing_cycle TEXT NOT NULL,                  -- MONTHLY, WEEKLY, ANNUALLY, etc.
  price_total TEXT NOT NULL,
  price_currency TEXT NOT NULL,
  next_billing_date TIMESTAMP,                  -- Nullable
  last_billing_date TIMESTAMP,                  -- Nullable
  start_date TIMESTAMP,                         -- Nullable
  next_renewal_date TIMESTAMP,                  -- Nullable
  expiration_date TIMESTAMP,                    -- Nullable
  is_paid BOOLEAN,                              -- Nullable
  is_family_plan BOOLEAN,                       -- Nullable
  is_cancellable BOOLEAN NOT NULL,
  cancel_instructions TEXT,                     -- Nullable
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_knot_sub_user_merchant
  ON knot_subscriptions (user_id, merchant_id);
```

The upsert:
```sql
INSERT INTO knot_subscriptions (id, user_id, merchant_id, external_id, name, description, status, billing_cycle, price_total, price_currency, next_billing_date, last_billing_date, start_date, next_renewal_date, expiration_date, is_paid, is_family_plan, is_cancellable, cancel_instructions, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, now())
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  billing_cycle = EXCLUDED.billing_cycle,
  price_total = EXCLUDED.price_total,
  next_billing_date = EXCLUDED.next_billing_date,
  last_billing_date = EXCLUDED.last_billing_date,
  is_cancellable = EXCLUDED.is_cancellable,
  updated_at = now();
```

### Step 5: Testing

In the development environment, test by first performing a card switch via CardSwitcher using `POST /development/accounts/link`:

```
POST https://development.knotapi.com/development/accounts/link
{
  "external_user_id": "test-user-1",
  "merchant_id": 18,
  "card_switcher": true,
  "card_id": "test-card-123"
}
```

The resulting `CARD_UPDATED` webhook will include subscription IDs in `data.subscriptions` that you can use to test `GET /subscriptions/{id}`.

**Test merchants:**

| Merchant | merchant_id |
|----------|-------------|
| Verizon | 11 |
| T-Mobile | 152 |
| Spectrum | 90 |
| Xfinity Internet | 2256 |
| Xfinity Mobile | 2255 |
| Apple | 60 |
| Netflix | 16 |
| Disney+ | 8 |
| Hulu | 18 |
| Spotify | 13 |

## Pitfalls

- **Prerequisite: CardSwitcher** — Subscriptions are only returned in the `CARD_UPDATED` webhook after a successful card switch.
- **Webhook timeout**: Return 200 immediately. Retrieve subscription details asynchronously.
- **Always upsert**: Webhook retries can deliver the same `CARD_UPDATED` multiple times.
- **Handle nulls**: Several subscription fields are nullable. Check the schema below for which fields can be `null`.

## Subscription Object Schema

Store all fields from each subscription. Fields marked nullable may be `null` — the implementation must handle this.

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | string | No | Unique identifier for the subscription. **Dedup key.** |
| `external_id` | string | No | Merchant-provided subscription identifier |
| `name` | string | No | Human-readable subscription name as displayed by the merchant |
| `description` | string | Yes | Description of the subscription plan |
| `merchant` | object | No | `{ id: integer, name: string }` |
| `status` | enum | No | Subscription lifecycle state |
| `billing_cycle` | enum | No | How often the subscription bills |
| `next_billing_date` | string (ISO 8601) | Yes | Next scheduled charge date in UTC |
| `last_billing_date` | string (ISO 8601) | Yes | Most recent attempted charge date in UTC |
| `start_date` | string (ISO 8601) | Yes | Subscription start date in UTC |
| `next_renewal_date` | string (ISO 8601) | Yes | Next renewal date in UTC |
| `expiration_date` | string (ISO 8601) | Yes | Loss of access date due to cancellation in UTC |
| `cancel_instructions` | string | Yes | Instructions for cancelling, if available |
| `is_paid` | boolean | Yes | Whether the subscription is paid or free |
| `is_family_plan` | boolean | Yes | Whether the subscription is a family plan |
| `is_cancellable` | boolean | No | Whether this subscription can be cancelled via Knot |
| `price` | object | No | `{ total: string, currency: string }` — both not null, currency in ISO 4217 |

**status enum:** `ACTIVE`, `ACTIVE_CANCELLATION`, `ACTIVE_PLAN_CHANGE`, `PENDING`, `PAUSED`, `CANCELLED`, `SUSPENDED`, `UNRECOGNIZED`

**billing_cycle enum:** `MONTHLY`, `WEEKLY`, `BIWEEKLY`, `ANNUALLY`, `DAILY`, `UNRECOGNIZED`
