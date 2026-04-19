-- Curated / scraped class action settlements for LegalRedress matching
CREATE TABLE IF NOT EXISTS public.settlements (
  id TEXT PRIMARY KEY,
  defendant TEXT NOT NULL,
  title TEXT NOT NULL,
  product_category TEXT,
  eligible_products TEXT,
  chemicals_involved TEXT[] DEFAULT '{}',
  deadline TEXT,
  payout_estimate TEXT,
  proof_required BOOLEAN DEFAULT false,
  claim_url TEXT,
  status TEXT DEFAULT 'active',
  payout_tiers JSONB DEFAULT '[]'::jsonb,
  scraped_at TIMESTAMPTZ DEFAULT now(),
  source_url TEXT
);

CREATE INDEX IF NOT EXISTS settlements_scraped_at_idx ON public.settlements (scraped_at DESC);
CREATE INDEX IF NOT EXISTS settlements_status_idx ON public.settlements (status);

ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settlements_anon_select"
  ON public.settlements
  FOR SELECT
  TO anon, authenticated
  USING (true);

COMMENT ON TABLE public.settlements IS 'Scraped or seeded open settlements; populated by scrape-settlements edge function.';
