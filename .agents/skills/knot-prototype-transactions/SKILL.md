---
name: knot-prototype-transactions
description: >
  Quickly generate and retrieve sample transaction data from Knot's development API for
  prototyping — no SDK, no webhooks, no production setup required. Use when: (1) "prototype
  with transaction data", (2) "get sample transactions from Knot", (3) "generate test
  transaction data", (4) "prototype a UI with Knot data", (5) "get transaction data for
  prototyping", (6) "pull dev transactions to build with", (7) "create a prototype using
  Knot transactions". This skill is development-only and never touches production.
metadata:
  author: Knot
  version: "1.0"
---

# Prototype with Transaction Data

Generate sample SKU-level transaction data from Knot's development API and use it immediately for prototyping — building UIs, exploring data shapes, or mocking up features. No SDK integration, no webhook setup, no production credentials. Just data.

## API Reference

### POST /development/accounts/link

Base URL: `https://development.knotapi.com`

**Request body:**
```json
{
  "external_user_id": "string (required) — your unique identifier for the user",
  "merchant_id": "integer (required) — unique identifier for the merchant (use 19 for DoorDash)",
  "transactions": {
    "new": "boolean (required) — whether to generate new sample transactions",
    "updated": "boolean (optional, default false) — whether to also update some generated transactions. Requires new: true"
  }
}
```

**Response (200):**
```json
{ "message": "Success" }
```

**Errors:** 401 with `INVALID_API_KEYS` means wrong credentials or using production keys against the development URL.

### POST /transactions/sync

Base URL: `https://development.knotapi.com`

**Request body:**
```json
{
  "merchant_id": "integer (required)",
  "external_user_id": "string (required)",
  "cursor": "string or null — null on first call, then pass next_cursor from previous response",
  "limit": "integer (optional, min 1, max 100, default 5)"
}
```

**Response (200):**
```json
{
  "merchant": { "id": 19, "name": "DoorDash" },
  "transactions": [ ...array of transaction objects... ],
  "next_cursor": "string or null — null when no more pages remain",
  "limit": 100
}
```

## Workflow

### Step 1: Get Development API Keys

First, check whether the user already has a saved API key from a previous session. Look for a `.env` file in the working directory (or a parent) containing `KNOT_DEV_API_KEY`. If found, use it and skip to Step 2.

If no saved key exists, the user needs their **development** credentials from the Knot Dashboard. Walk them through it:

1. Go to https://dashboard.knotapi.com/developers/keys
2. Make sure the **Development** environment is selected (not Production)
3. Copy the **Client ID** (click the copy button)
4. Click **View** on the **Secret** to reveal it, then copy it

Ask the user to provide both values. Once they do, construct the API key:

```
API Key = base64("CLIENT_ID:SECRET")
```

Use base64 encoding (e.g., run `echo -n "CLIENT_ID:SECRET" | base64` in the terminal) and set the resulting string as the `Authorization: Basic <key>` header for all subsequent API calls.

**Save the key for future sessions:** After constructing the base64-encoded API key, save it so the user doesn't need to retrieve their credentials again. Add it to a `.env` file in the working directory:

```
KNOT_DEV_API_KEY=<base64-encoded key>
```

If a `.env` file already exists, append the line. If `.gitignore` exists and doesn't already cover `.env`, add it. Mention to the user that this key is saved locally so they won't need to provide it again next time.

**Important:** These are development-only credentials. They only work against `https://development.knotapi.com`. Never use production credentials with this skill.

### Step 2: Generate Sample Transactions

Ask the user which merchant(s) they want to generate transaction data for. Present this list:

- Walmart
- Amazon
- DoorDash
- Uber Eats
- Instacart
- Target
- Costco
- Gopuff
- Shop Pay

The user can pick one or multiple. For each selected merchant, call the development account link endpoint. No SDK or webhook setup is required — this endpoint simulates a full merchant account link and transaction generation server-side.

```
POST https://development.knotapi.com/development/accounts/link
Authorization: Basic <base64(client_id:secret)>
Content-Type: application/json

{
  "external_user_id": "prototype-user-1",
  "merchant_id": <merchant_id>,
  "transactions": {
    "new": true,
    "updated": false
  }
}
```

This generates ~205 sample transactions per merchant. The `external_user_id` can be any string — use something descriptive for the prototype session. Use the same `external_user_id` across merchants if the prototype involves a single user with multiple merchant accounts.

**If running this multiple times**, use a different `external_user_id` each time (e.g., `prototype-user-2`, `prototype-user-3`) to avoid conflicts with previously generated data.

**Merchant ID reference:**

| Merchant | ID |
|----------|----|
| Walmart | 45 |
| Amazon | 44 |
| DoorDash | 19 |
| Uber Eats | 36 |
| Instacart | 40 |
| Target | 12 |
| Costco | 165 |
| Gopuff | 41 |
| Shop Pay | 2125 |

### Step 3: Retrieve Transactions

Poll the sync endpoint directly after the link call. No webhook is needed — just query for the data.

For each merchant the user selected, call `POST /transactions/sync` in a loop with a high limit to pull all generated transactions:

```
for each merchant_id:
  cursor = null

  loop:
    POST https://development.knotapi.com/transactions/sync
    Authorization: Basic <base64(client_id:secret)>
    Content-Type: application/json

    {
      "merchant_id": <merchant_id>,
      "external_user_id": "prototype-user-1",
      "cursor": cursor,
      "limit": 100
    }

    -> collect response.transactions (along with response.merchant for context)
    -> cursor = response.next_cursor
    -> break if cursor is null
```

With `limit: 100` and ~205 sample transactions per merchant, each merchant takes about 3 pages. Collect all transactions into a single array (or group by merchant, depending on the prototype).

**If the response returns 0 transactions**, the data may not be ready yet. Retry the request. Development transaction generation typically completes within a few seconds.

### Step 4: Use the Data

Once transactions are retrieved, ask the user how they want to use the data:

**Option A: Prototype in this session**

Keep the transaction data in memory and start building immediately. Use real field values from the retrieved data to make the prototype feel realistic.

**Option B: Export to a Markdown file**

Save the transaction data to a structured `.md` file that can be referenced later or shared with others. Write the file with this structure:

```markdown
# Knot Transaction Data — Prototype

Generated: {date}
Merchant: {merchant_name} (ID: {merchant_id})
External User ID: {external_user_id}
Transaction Count: {count}

## Summary

- Total transactions: {count}
- Date range: {earliest_date} to {latest_date}
- Order statuses: {list of unique statuses with counts}
- Total spend: {sum of price.total values}

## Transactions

### {transaction.id}

- **Date:** {datetime}
- **Status:** {order_status}
- **Total:** {price.total} {price.currency}
- **Products:**
  - {product.name} (qty: {quantity}) — {product.price.total}
  - ...
- **Payment:** {payment_methods[0].type} ending {last_four}
- **Order URL:** {url}

...repeated for each transaction...
```

Save the file in the user's working directory (e.g., `knot-transactions-prototype.md`). This file can then be used as context for future prototyping sessions.

## Transaction Object Reference

Each transaction returned by `/transactions/sync` has this shape:

### Top-level fields

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | string (UUID) | No | Unique transaction identifier |
| `external_id` | string | Yes | Merchant-provided order identifier |
| `datetime` | string (ISO 8601) | No | Transaction timestamp in UTC |
| `order_status` | enum | No | `ORDERED`, `BILLED`, `SHIPPED`, `DELIVERED`, `PICKED_UP`, `COMPLETED`, `REFUNDED`, `CANCELLED`, `FAILED`, `RETURNED`, `UNRECOGNIZED` |
| `url` | string | Yes | Direct link to order in merchant account |
| `price` | object | No | `{ sub_total, total, currency, adjustments[] }` |
| `products` | array | No | SKU-level items (see below) |
| `payment_methods` | array | No | Payment methods used (see below) |
| `shipping` | object | Yes | Delivery details (see below). Null for digital/in-store orders. |

The `merchant` object (`{ id, name }`) is in the sync response wrapper, not inside each transaction.

### shipping

Nullable at the top level. Contains a single `location` field (also nullable).

#### shipping.location

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `first_name` | string | Yes | Recipient's first name |
| `last_name` | string | Yes | Recipient's last name |
| `address` | object | Yes | Delivery address (see below) |

#### shipping.location.address

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `line1` | string | Yes | First line of the address |
| `line2` | string | Yes | Second line of the address |
| `city` | string | Yes | City |
| `region` | string | Yes | State/region (ISO 3166-2 code, e.g. `"CA"`) |
| `postal_code` | string | Yes | Postal code |
| `country` | string | No | Country (ISO 3166-1 alpha-2 code, e.g. `"US"`) |

### products[]

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `external_id` | string | Yes | Merchant-provided product identifier |
| `name` | string | No | Product name |
| `description` | string | Yes | Additional product details |
| `url` | string | Yes | Link to product page |
| `image_url` | string | Yes | Link to product image |
| `quantity` | integer | Yes | Number of units |
| `eligibility` | array of strings | No | Special spending categories (e.g. `"FSA/HSA"`) |
| `price` | object | Yes | `{ sub_total, total, unit_price }` — all nullable strings |
| `seller` | object | Yes | Seller info for marketplace products (see below). Null when the merchant is also the seller. Never an empty object. |

### products[].seller

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Name of the seller offering the product |
| `url` | string | Yes | URL of the seller's page within the merchant's marketplace |

### payment_methods[]

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `type` | enum | No | `CARD`, `APPLE_PAY`, `GOOGLE_PAY`, `PAYPAL`, `CASH_APP`, `VENMO`, `AFFIRM`, `KLARNA`, `GIFT_CARD`, `CASH`, `BANK_ACCOUNT`, `LOYALTY_POINTS`, `UNRECOGNIZED` |
| `brand` | string | Yes | Card network or store card name |
| `last_four` | string | Yes | Last four digits |
| `transaction_amount` | string | Yes | Amount charged to this method |

### price.adjustments[]

Each adjustment: `type` (enum: `DISCOUNT`, `TAX`, `TIP`, `FEE`, `REFUND`, `UNRECOGNIZED`), `label` (nullable string), `amount` (string — positive increases total, negative decreases).

## Rules

- **Development only.** This skill uses `https://development.knotapi.com` exclusively. Never use production credentials or the production base URL.
- **New user ID each run.** Reusing the same `external_user_id` across multiple link calls can produce unexpected results. Increment or randomize the ID.
- **Retry on empty results.** If `/transactions/sync` returns 0 transactions, the data isn't ready yet. Retry the request.
- **Paginate fully.** Even in development, transactions come in pages. Loop until `next_cursor` is `null`.
- **No webhooks.** This prototyping flow skips webhook setup entirely. The sync endpoint returns data regardless of whether a webhook was received.
- **Use the merchant ID table.** Always look up the merchant ID from the reference table in Step 2. Do not guess or hardcode IDs.
