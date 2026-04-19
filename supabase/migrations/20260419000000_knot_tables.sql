-- Knot TransactionLink: persisted state driven by webhooks.
-- Populated by the knot-webhook edge function (signature-verified) and read
-- by knot-proxy's get-accounts / get-transactions actions. Browser never
-- touches these tables directly -- service-role only.

CREATE TABLE IF NOT EXISTS public.knot_transactions (
  id TEXT PRIMARY KEY,
  external_user_id TEXT NOT NULL,
  merchant_id INTEGER NOT NULL,
  merchant_name TEXT,
  external_id TEXT,
  datetime TIMESTAMPTZ NOT NULL,
  order_status TEXT NOT NULL,
  url TEXT,
  price_total TEXT NOT NULL,
  price_sub_total TEXT,
  price_currency TEXT,
  products JSONB,
  payment_methods JSONB,
  shipping JSONB,
  raw JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knot_txn_user_merchant_idx
  ON public.knot_transactions (external_user_id, merchant_id, datetime DESC);

CREATE TABLE IF NOT EXISTS public.knot_merchant_accounts (
  external_user_id TEXT NOT NULL,
  merchant_id INTEGER NOT NULL,
  merchant_name TEXT,
  connection_status TEXT NOT NULL DEFAULT 'connected',
  last_authenticated_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  transaction_count INTEGER DEFAULT 0,
  PRIMARY KEY (external_user_id, merchant_id)
);

CREATE TABLE IF NOT EXISTS public.knot_sync_cursors (
  external_user_id TEXT NOT NULL,
  merchant_id INTEGER NOT NULL,
  cursor TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (external_user_id, merchant_id)
);

ALTER TABLE public.knot_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knot_merchant_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knot_sync_cursors ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.knot_transactions IS
  'Knot TransactionLink: SKU-level transactions. Upserted by knot-webhook on NEW/UPDATED_TRANSACTIONS_AVAILABLE. Keyed by Knot transaction id.';
COMMENT ON TABLE public.knot_merchant_accounts IS
  'Knot TransactionLink: per-user, per-merchant connection status. Upserted by knot-webhook on AUTHENTICATED / ACCOUNT_LOGIN_REQUIRED.';
COMMENT ON TABLE public.knot_sync_cursors IS
  'Knot TransactionLink: cursor per (external_user_id, merchant_id) so syncs resume where they left off.';
